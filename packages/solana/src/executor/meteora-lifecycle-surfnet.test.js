// @ts-check
/**
 * Meteora `initialize_position` and `close_position2` through the real executor on an offline
 * Surfnet. The program is not executed here, so a build that reaches simulation fails and is
 * not sent. A refused width or a position that still holds shares never gets that far.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AccountRole } from "@solana/kit";
import {
  BuildRejected,
  LiquidityInputInvalid,
  SimulationFailed,
  executeClosePosition,
  executeOpenPosition,
  simulateClosePosition,
  simulateOpenPosition,
} from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { randomAddress } from "../liquidity/liquidity-token-fixture.js";
import { binArrayAddress, eventAuthorityAddress } from "../liquidity/meteora-dlmm-bins.js";
import {
  CLOSE_POSITION2_DISCRIMINATOR,
  INITIALIZE_POSITION_DISCRIMINATOR,
  closeCoverageIndexes,
} from "../liquidity/meteora-dlmm-position-ix.js";
import { METEORA_DLMM_PROGRAM } from "../liquidity/meteora-dlmm-program.js";
import { seedMeteoraPair, seedMeteoraPosition } from "../liquidity/meteora-dlmm-seeds.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** @type {(seed: Uint8Array) => import("effect").Layer.Layer<any>} */
let layer;

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  layer = (seed) => SolanaTestLive({ rpcUrl: rpc.url, wsUrl: surfnet.wsUrl, seed });
});

afterAll(() => {
  rpc.stop();
});

const traffic = () => ({
  reads: rpc.callsFor("getMultipleAccounts").length,
  sims: rpc.callsFor("simulateTransaction").length,
  sends: rpc.callsFor("sendTransaction").length,
});

/** @param {import("effect").Effect.Effect<unknown, unknown, never>} effect @param {Uint8Array} seed */
const failureOf = async (effect, seed) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer(seed)));
  if (exit._tag !== "Failure") throw new Error("expected a domain failure");
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) throw new Error(`not a failure value: ${String(exit.cause)}`);
  return Option.getOrThrow(failure);
};

/** @param {string} pool @param {Record<string, number>} [over] */
const openIntent = (pool, over = {}) => ({
  protocol: /** @type {const} */ ("meteora"),
  pool,
  lowerBinId: 0,
  width: 3,
  ...over,
});

const seedPair = () =>
  seedMeteoraPair(surfnet.rpcUrl, {
    mintX: randomAddress(),
    mintY: randomAddress(),
    activeId: 0,
    binStep: 1,
  });

const ONE_BIN = Object.freeze({ lowerBinId: 0, upperBinId: 0 });

/**
 * @param {string} owner
 * @param {readonly { index: number; share: bigint }[]} shares
 * @param {{ lowerBinId: number; upperBinId: number }} [binWindow]
 */
const seedPosition = async (owner, shares, binWindow = ONE_BIN) => {
  const pair = await seedPair();
  const position = await seedMeteoraPosition(surfnet.rpcUrl, {
    lbPair: pair,
    owner,
    lowerBinId: binWindow.lowerBinId,
    upperBinId: binWindow.upperBinId,
    shares,
  });
  return { pair, position };
};

/** The last simulated transaction, compiled plus its Meteora instruction. */
const lastSimulated = async () => {
  const wireBase64 = /** @type {string} */ (
    /** @type {{ params?: unknown[] }} */ (rpc.callsFor("simulateTransaction").at(-1))?.params?.[0]
  );
  const kit = await import("@solana/kit");
  const transaction = kit.getTransactionDecoder().decode(kit.getBase64Codec().encode(wireBase64));
  const compiled = kit.getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const message = kit.decompileTransactionMessage(
    /** @type {Parameters<typeof kit.decompileTransactionMessage>[0]} */ (compiled),
  );
  const instruction = message.instructions.find(
    (ix) => String(ix.programAddress) === METEORA_DLMM_PROGRAM,
  );
  return { compiled, instruction };
};

/** @param {Uint8Array | undefined} data @param {number} offset */
const i32At = (data, offset) => {
  if (data === undefined) return NaN;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getInt32(offset, true);
};

/** @param {unknown} failure */
const reasonOf = (failure) => /** @type {{ reason: string }} */ (failure).reason;

describe("meteora position lifecycle against Surfnet [integration]", () => {
  test("an illegal width is refused before any read, simulation, or send", async () => {
    const seed = randomSeed();
    const before = traffic();
    const wide = await failureOf(
      simulateOpenPosition(openIntent(randomAddress(), { width: 71 })),
      seed,
    );
    expect(wide).toBeInstanceOf(LiquidityInputInvalid);
    expect(reasonOf(wide)).toContain("71");
    expect(reasonOf(wide)).toContain("not clamped");
    const past = await failureOf(
      simulateOpenPosition(openIntent(randomAddress(), { lowerBinId: 443_636, width: 2 })),
      seed,
    );
    expect(reasonOf(past)).toContain("443637");
    expect(reasonOf(past)).toContain("not clamped");
    const executed = await failureOf(
      executeOpenPosition({ ...openIntent(randomAddress(), { width: 71 }), skipSimulation: false }),
      seed,
    );
    expect(executed).toBeInstanceOf(LiquidityInputInvalid);
    expect(traffic()).toEqual(before);
  });

  test("an empty open signs initialize_position for a second key and sends nothing", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const pool = await seedPair();
    const before = traffic();
    const simulated = await failureOf(simulateOpenPosition(openIntent(pool)), seed);
    expect(simulated).toBeInstanceOf(SimulationFailed);
    expect(traffic().sends).toBe(before.sends);
    expect(traffic().sims).toBe(before.sims + 1);
    const { compiled, instruction } = await lastSimulated();
    expect(compiled.header.numSignerAccounts).toBe(2);
    const positionKey = compiled.staticAccounts[1];
    expect(positionKey).toBeDefined();
    expect(String(positionKey)).not.toBe(owner);
    if (instruction === undefined) throw new Error("missing initialize_position instruction");
    expect(instruction.data.slice(0, 8)).toEqual(
      Uint8Array.from(INITIALIZE_POSITION_DISCRIMINATOR),
    );
    expect(i32At(instruction.data, 8)).toBe(0);
    expect(i32At(instruction.data, 12)).toBe(3);
    const executed = await failureOf(
      executeOpenPosition({ ...openIntent(pool), skipSimulation: false }),
      seed,
    );
    expect(executed).toBeInstanceOf(SimulationFailed);
    expect(traffic().sends).toBe(before.sends);
  });

  test("close is refused while liquidity shares remain, and an empty close is not sent", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const held = await seedPosition(owner, [{ index: 0, share: 1_000_000n }]);
    const before = traffic();
    const refused = await failureOf(
      simulateClosePosition({ protocol: "meteora", position: held.position }),
      seed,
    );
    expect(refused).toBeInstanceOf(BuildRejected);
    expect(reasonOf(refused)).toContain("1000000");
    expect(reasonOf(refused)).toContain("liquidity shares");
    expect(/** @type {{ remedy: string }} */ (refused).remedy).toContain(
      "solana_liquidity_execute_withdraw",
    );
    const executed = await failureOf(
      executeClosePosition({
        protocol: "meteora",
        position: held.position,
        skipSimulation: false,
      }),
      seed,
    );
    expect(executed).toBeInstanceOf(BuildRejected);
    expect(traffic().sends).toBe(before.sends);
    expect(traffic().sims).toBe(before.sims);
    expect(traffic().reads).toBeGreaterThan(before.reads);

    const empty = await seedPosition(owner, [], { lowerBinId: 70, upperBinId: 70 });
    const closed = await failureOf(
      simulateClosePosition({ protocol: "meteora", position: empty.position }),
      seed,
    );
    expect(closed).toBeInstanceOf(SimulationFailed);
    expect(traffic().sends).toBe(before.sends);
    expect(traffic().sims).toBe(before.sims + 1);
    const { compiled, instruction } = await lastSimulated();
    expect(compiled.header.numSignerAccounts).toBe(1);
    if (instruction === undefined) throw new Error("missing close_position2 instruction");
    expect(instruction.data).toEqual(Uint8Array.from(CLOSE_POSITION2_DISCRIMINATOR));
    const accounts = instruction.accounts ?? [];
    const addresses = accounts.map((meta) =>
      typeof meta === "string" ? meta : String(meta.address),
    );
    const coverage = await Promise.all(
      closeCoverageIndexes(70).map((index) => binArrayAddress(empty.pair, index)),
    );
    const eventAuthority = await eventAuthorityAddress();
    expect(addresses.slice(0, 5)).toEqual([
      empty.position,
      owner,
      owner,
      eventAuthority,
      METEORA_DLMM_PROGRAM,
    ]);
    expect(addresses.slice(5)).toEqual(coverage);
    expect(accounts[5]?.role).toBe(AccountRole.WRITABLE);
    expect(accounts[6]?.role).toBe(AccountRole.WRITABLE);
  });
});
