// @ts-check
/**
 * The Meteora point read through real RPC against a seeded offline Surfnet.
 * Owner enumeration is covered beside this file.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { createSolanaRpc } from "@solana/kit";
import { Cause, Effect, Option } from "effect";
import { TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { ensureOfflineSurfnet } from "../surfnet/test-surfnet.js";
import { getPositionLive } from "./liquidity-read.js";
import { randomAddress } from "./liquidity-seeds.js";
import { seedMeteoraBinArray, seedMeteoraPair, seedMeteoraPosition } from "./meteora-dlmm-seeds.js";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** @type {{ rpcUrl: string; read: import("../market/account-read.js").AccountRead; pair: string; mintX: string; mintY: string }} */
let fx;

const run = (/** @type {import("effect").Effect.Effect<unknown, unknown, never>} */ effect) =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (exit._tag === "Success") return exit.value;
    const failure = Cause.failureOption(exit.cause);
    if (Option.isNone(failure)) throw new Error(String(exit.cause));
    return /** @type {{ _tag?: string; reason?: string }} */ (failure.value);
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

/** @param {string} owner */
const seedFunded = async (owner) => {
  const position = await seedMeteoraPosition(fx.rpcUrl, {
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
  return position;
};

describe("meteora dlmm position read over seeded Surfnet [integration]", () => {
  test("a seeded position reads back through the venue dispatcher", async () => {
    const owner = randomAddress();
    const position = await seedFunded(owner);
    const result = await run(getPositionLive(fx.read, { protocol: "meteora", position, owner }));
    expect(result).toMatchObject({
      kind: "lp",
      protocol: "meteora",
      position,
      instrument: fx.pair,
      liquidity: "8",
      tokenA: { mint: fx.mintX, amount: "6", decimals: 9 },
      tokenB: { mint: fx.mintY, amount: "7", decimals: 6 },
      valueUsd: null,
    });
  });

  test("an owned zero-liquidity position is a successful zero read without bin arrays", async () => {
    const owner = randomAddress();
    const position = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner,
      lowerBinId: 4,
      upperBinId: 4,
    });
    const result = await run(getPositionLive(fx.read, { protocol: "meteora", position, owner }));
    expect(result).toMatchObject({
      liquidity: "0",
      tokenA: { amount: "0" },
      tokenB: { amount: "0" },
    });
  });

  test("a foreign owner field is refused without treating the account as unowned", async () => {
    const position = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner: randomAddress(),
      lowerBinId: 0,
      upperBinId: 0,
    });
    const result = await run(
      getPositionLive(fx.read, { protocol: "meteora", position, owner: randomAddress() }),
    );
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      reason: "position owner does not match the requested owner",
    });
  });

  test("a short position account is refused on its own guard", async () => {
    const owner = randomAddress();
    const position = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner,
      bytes: 80,
    });
    const result = await run(getPositionLive(fx.read, { protocol: "meteora", position, owner }));
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      reason: "position account is shorter than the PositionV2 layout",
    });
  });

  test("the wrong position discriminator is refused on its own guard", async () => {
    const owner = randomAddress();
    const position = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner,
      discriminator: new Uint8Array(8),
    });
    const result = await run(getPositionLive(fx.read, { protocol: "meteora", position, owner }));
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      reason: "position data does not carry the PositionV2 discriminator",
    });
  });

  test("a missing LbPair is refused on its own guard", async () => {
    const owner = randomAddress();
    const position = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: randomAddress(),
      owner,
      lowerBinId: 0,
      upperBinId: 0,
    });
    const result = await run(getPositionLive(fx.read, { protocol: "meteora", position, owner }));
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      reason: "referenced pair is missing",
    });
  });

  test("an LbPair owned by another program is refused on its own guard", async () => {
    const owner = randomAddress();
    const mintX = randomAddress();
    const mintY = randomAddress();
    const pair = await seedMeteoraPair(fx.rpcUrl, {
      mintX,
      mintY,
      accountOwner: TOKEN_PROGRAM,
    });
    const position = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: pair,
      owner,
      lowerBinId: 0,
      upperBinId: 0,
    });
    const result = await run(getPositionLive(fx.read, { protocol: "meteora", position, owner }));
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      reason: "referenced pair is not owned by the pinned Meteora DLMM program",
    });
  });

  test("a bin array that names a different pair is refused", async () => {
    const owner = randomAddress();
    const position = await seedMeteoraPosition(fx.rpcUrl, {
      lbPair: fx.pair,
      owner,
      lowerBinId: 0,
      upperBinId: 0,
      shares: [{ index: 0, share: 1n }],
    });
    await seedMeteoraBinArray(fx.rpcUrl, {
      lbPair: fx.pair,
      declaredPair: randomAddress(),
      index: 0,
      bins: [{ binId: 0, amountX: 1n, amountY: 1n, supply: 1n }],
    });
    const result = await run(getPositionLive(fx.read, { protocol: "meteora", position, owner }));
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      reason: "referenced bin array belongs to a different pair",
    });
  });
});
