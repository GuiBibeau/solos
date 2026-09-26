// @ts-check
/**
 * Meteora owner enumeration through real getProgramAccounts on offline Surfnet.
 * PositionV2 is seeded as a program account. There is no position NFT.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { createSolanaRpc } from "@solana/kit";
import { Cause, Effect, Option } from "effect";
import { TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { ensureOfflineSurfnet } from "../surfnet/test-surfnet.js";
import { listPositionsLive } from "./liquidity-enumerate.js";
import { getPositionLive } from "./liquidity-read.js";
import { randomAddress } from "./liquidity-seeds.js";
import { seedMeteoraBinArray, seedMeteoraPair, seedMeteoraPosition } from "./meteora-dlmm-seeds.js";

/** @type {{ rpcUrl: string; read: import("../market/account-read.js").AccountRead; pair: string; mintX: string; mintY: string }} */
let fx;

const byName = (/** @type {string} */ a, /** @type {string} */ b) => a.localeCompare(b);

const run = (/** @type {import("effect").Effect.Effect<unknown, unknown, never>} */ effect) =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (exit._tag === "Success") return exit.value;
    const failure = Cause.failureOption(exit.cause);
    if (Option.isNone(failure)) throw new Error(String(exit.cause));
    return /** @type {{ _tag?: string; reason?: string; positions?: unknown }} */ (failure.value);
  });

beforeAll(async () => {
  const surfnet = await ensureOfflineSurfnet();
  const mintX = randomAddress();
  const mintY = randomAddress();
  const pair = await seedMeteoraPair(surfnet.rpcUrl, { mintX, mintY, activeId: -5291, binStep: 4 });
  fx = {
    rpcUrl: surfnet.rpcUrl,
    read: {
      rpc: createSolanaRpc(surfnet.rpcUrl),
      origin: rpcOrigin(surfnet.rpcUrl),
      timeoutMs: TOKEN_RPC_TIMEOUT_MS,
    },
    pair,
    mintX,
    mintY,
  };
});

describe("meteora dlmm owner enumeration over seeded Surfnet [integration]", () => {
  test("lists that owner's PositionV2 accounts and no receipt mints", async () => {
    const owner = randomAddress();
    const funded = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner,
      lowerBinId: -1,
      upperBinId: 0,
      shares: [
        { index: 0, share: 3n },
        { index: 1, share: 5n },
      ],
    });
    await seedMeteoraBinArray(fx.rpcUrl, {
      lbPair: fx.pair,
      index: -1,
      bins: [{ binId: -1, amountX: 0n, amountY: 10n, supply: 4n }],
    });
    await seedMeteoraBinArray(fx.rpcUrl, {
      lbPair: fx.pair,
      index: 0,
      bins: [{ binId: 0, amountX: 10n, amountY: 1n, supply: 8n }],
    });
    const idle = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner,
      lowerBinId: 4,
      upperBinId: 4,
    });
    await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner: randomAddress(),
      lowerBinId: 0,
      upperBinId: 0,
    });
    await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner,
      lowerBinId: 0,
      upperBinId: 0,
      discriminator: new Uint8Array(8),
    });
    const result = await run(listPositionsLive(fx.read, { protocol: "meteora", owner }));
    expect(result.perpAccounts).toEqual([]);
    expect(result.receiptMints).toEqual([]);
    const listed = /** @type {{ position: string }[]} */ (result.positions);
    expect(listed.map((position) => position.position).toSorted(byName)).toEqual(
      [funded, idle].toSorted(byName),
    );
    const direct = await run(
      getPositionLive(fx.read, { protocol: "meteora", position: funded, owner }),
    );
    expect(listed.find((position) => position.position === funded)).toEqual(direct);
  });

  test("two positions on one pair batch the shared accounts", async () => {
    const owner = randomAddress();
    const window = {
      lbPair: fx.pair,
      owner,
      lowerBinId: 0,
      upperBinId: 0,
      shares: [{ index: 0, share: 4n }],
    };
    const first = await seedMeteoraPosition(fx.rpcUrl, window);
    const second = await seedMeteoraPosition(fx.rpcUrl, window);
    await seedMeteoraBinArray(fx.rpcUrl, {
      lbPair: fx.pair,
      index: 0,
      bins: [{ binId: 0, amountX: 8n, amountY: 2n, supply: 4n }],
    });
    const recorder = startRpcRecorder(fx.rpcUrl);
    const read = {
      rpc: createSolanaRpc(recorder.url),
      origin: rpcOrigin(recorder.url),
      timeoutMs: TOKEN_RPC_TIMEOUT_MS,
    };
    const result = await run(listPositionsLive(read, { protocol: "meteora", owner }));
    const batches = recorder.callsFor("getMultipleAccounts");
    recorder.stop();
    // A per-position read of two positions is six follow-up calls. One shared pair is one batch.
    expect(batches.length).toBeLessThan(6);
    const addresses = batches.flatMap((call) => /** @type {string[]} */ (call.params[0] ?? []));
    expect(addresses.filter((account) => account === fx.pair)).toHaveLength(1);
    expect(result.receiptMints).toEqual([]);
    const listed = /** @type {{ position: string }[]} */ (result.positions);
    expect(listed.map((position) => position.position).toSorted(byName)).toEqual(
      [first, second].toSorted(byName),
    );
    const direct = await run(
      getPositionLive(fx.read, { protocol: "meteora", position: first, owner }),
    );
    expect(listed.find((position) => position.position === first)).toEqual(direct);
  });

  test("an owner with no PositionV2 accounts enumerates empty", async () => {
    const result = await run(
      listPositionsLive(fx.read, { protocol: "meteora", owner: randomAddress() }),
    );
    expect(result).toEqual({ positions: [], perpAccounts: [], receiptMints: [] });
  });

  test("one corrupt candidate fails the whole enumeration, never a partial array", async () => {
    const owner = randomAddress();
    await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner,
      lowerBinId: 0,
      upperBinId: 0,
    });
    await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner,
      lowerBinId: 3,
      upperBinId: 1,
    });
    const result = await run(listPositionsLive(fx.read, { protocol: "meteora", owner }));
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      reason: "position bin window is inverted",
    });
    expect(result.positions).toBeUndefined();
  });
});
