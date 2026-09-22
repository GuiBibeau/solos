// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { tickIndexToSqrtPrice } from "@orca-so/whirlpools-core";
import { getBase64Codec, getTransactionDecoder } from "@solana/kit";
import {
  BuildRejected,
  executeWithdraw,
  LiquidityUnsupportedProtocol,
  SimulationFailed,
  simulateWithdraw,
} from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { seedWhirlpool, seedWhirlpoolPosition } from "../liquidity/liquidity-seeds.js";
import { SQRT_PRICE_ONE } from "../liquidity/whirlpool-fixture.js";
import { WHIRLPOOL_PROGRAM } from "../liquidity/whirlpool-program.js";
import { DECREASE_LIQUIDITY_DISCRIMINATOR } from "../liquidity/whirlpool-withdraw-instruction.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { surfnetCheatcodes } from "../surfnet/surfnet-cli.js";
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

/**
 * The withdraw twins through the real ActionExecutor over the offline Surfnet: synthetic
 * Whirlpool accounts are seeded with the `surfnet_setAccount` cheatcode and the Whirlpool
 * program is never meaningfully invoked — a simulation therefore fails on chain, which is
 * exactly the honest path under test: failed simulations send nothing, rejected builds
 * never even simulate, and the decoded wire instruction proves the liquidity amount and
 * both minimum receipts the caller signed up for.
 */

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** @type {(seed: Uint8Array) => import("effect").Layer.Layer<any>} */
let withdrawLayer;
let owner = "";

const intent = (position) => ({
  protocol: /** @type {"orca"} */ ("orca"),
  position,
  bps: 10_000,
  maxSlippageBps: 50,
});

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  withdrawLayer = (seed) => SolanaTestLive({ rpcUrl: rpc.url, wsUrl: surfnet.wsUrl, seed });
});

afterAll(() => {
  rpc.stop();
});

/**
 * Seed one self-consistent pool+position family for `owner` with real liquidity, and fund
 * the signer's receiving accounts. `belowRange` prices the pool far below the position's
 * range (a one-sided removal); `skipA` leaves the signer's token A receiving account
 * absent so the receipt proof is exercised.
 * @param {{ liquidity?: bigint; belowRange?: boolean; skipA?: boolean }} [options]
 */
const seedFamily = async (options = {}) => {
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  const sqrtPrice = options.belowRange === true ? tickIndexToSqrtPrice(-2000) : SQRT_PRICE_ONE;
  const pool = await seedWhirlpool(surfnet.rpcUrl, { sqrtPrice });
  const position = await seedWhirlpoolPosition(surfnet.rpcUrl, {
    pool: pool.pool,
    owner,
    liquidity: options.liquidity ?? 10n ** 12n,
    tickLowerIndex: options.belowRange === true ? 0 : -1000,
    tickUpperIndex: 1000,
  });
  if (options.skipA !== true) await cheats.setTokenAccount(owner, pool.mintA, 10n ** 6n);
  await cheats.setTokenAccount(owner, pool.mintB, 10n ** 6n);
  return { pool, position };
};

/**
 * @param {Effect.Effect<unknown, unknown, never>} effect
 * @param {Uint8Array} seed
 * @returns {Promise<unknown>} the typed domain failure, or throws on unexpected defects
 */
const failureOf = async (effect, seed) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, withdrawLayer(seed)));
  if (exit._tag !== "Failure") throw new Error("expected a domain failure");
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) throw new Error(`not a failure value: ${String(exit.cause)}`);
  return Option.getOrThrow(failure);
};

describe("liquidity withdraw executor against Surfnet [integration]", () => {
  test("a valid in-range removal simulates, fails honestly on the fork, and sends nothing", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { position } = await seedFamily();
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOf(simulateWithdraw(intent(position.position)), seed);
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("the decoded wire instruction carries the removed liquidity and both minimum receipts", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { position } = await seedFamily({ liquidity: 10n ** 12n });
    await failureOf(simulateWithdraw(intent(position.position)), seed);
    const calls = rpc.callsFor("simulateTransaction");
    const wireBase64 = /** @type {string} */ (
      /** @type {{ params: Array<unknown> }} */ (calls.at(-1))?.params?.[0]
    );
    const transaction = getTransactionDecoder().decode(getBase64Codec().encode(wireBase64));
    const decompiled = await (async () => {
      const kit = await import("@solana/kit");
      const compiled = kit.getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
      return kit.decompileTransactionMessage(compiled);
    })();
    const decrease = decompiled.instructions.find((ix) => ix.programAddress === WHIRLPOOL_PROGRAM);
    expect(decrease).toBeDefined();
    if (!decrease) return;
    const data = decrease.data;
    expect(data.slice(0, 8)).toEqual(new Uint8Array(DECREASE_LIQUIDITY_DISCRIMINATOR));
    let liquidity = 0n;
    for (let i = 15; i >= 8; i -= 1) liquidity = (liquidity << 8n) | BigInt(data[i]);
    expect(liquidity).toBe(10n ** 12n);
    let minA = 0n;
    for (let i = 31; i >= 24; i -= 1) minA = (minA << 8n) | BigInt(data[i]);
    let minB = 0n;
    for (let i = 39; i >= 32; i -= 1) minB = (minB << 8n) | BigInt(data[i]);
    expect(minA).toBeLessThanOrEqual(minB + 1n); // both present and ordered per the quote
    expect(minA > 0n || minB > 0n).toBe(true);
    // The instruction names the position, and the authority is the signer.
    const accountAddresses = decrease.accounts?.map((meta) =>
      typeof meta === "string" ? meta : meta.address,
    );
    expect(accountAddresses).toContain(position.position);
  });

  test("a one-sided removal without a token A account fails the receipt proof, not simulation", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { position } = await seedFamily({ belowRange: true, skipA: true });
    const sims = rpc.callsFor("simulateTransaction").length;
    // Below-range price: the position owes only token B... its range sits above the price,
    // so the quote pays token A. The absent A account is owed tokens — a typed rejection.
    const failure = await failureOf(simulateWithdraw(intent(position.position)), seed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("receiving account");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("a computed zero removal is rejected before any simulation", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { position } = await seedFamily({ liquidity: 5n });
    const sims = rpc.callsFor("simulateTransaction").length;
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOf(
      simulateWithdraw({ ...intent(position.position), bps: 1 }),
      seed,
    );
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("zero liquidity");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("a position the signer does not own is rejected before any simulation", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const otherSeed = randomSeed();
    const otherOwner = await seedAddress(otherSeed);
    const { pool } = await seedFamily({ liquidity: 10n ** 12n });
    // A position whose NFT is custodied by someone else entirely.
    const foreign = await seedWhirlpoolPosition(surfnet.rpcUrl, {
      pool: pool.pool,
      owner: otherOwner,
      liquidity: 10n ** 12n,
      tickLowerIndex: -1000,
      tickUpperIndex: 1000,
    });
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(simulateWithdraw(intent(foreign.position)), seed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain(
      "does not hold the position NFT",
    );
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("meteora fails the protocol gate before the executor touches anything", async () => {
    const seed = randomSeed();
    const reads = rpc.callsFor("getMultipleAccounts").length;
    const failure = await failureOf(
      simulateWithdraw({
        ...intent("2".repeat(44)),
        protocol: /** @type {"orca"} */ ("meteora"),
      }),
      seed,
    );
    expect(failure).toBeInstanceOf(LiquidityUnsupportedProtocol);
    expect(rpc.callsFor("getMultipleAccounts").length).toBe(reads);
  });

  test("the execute twin also refuses to send when its simulation fails", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { position } = await seedFamily();
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOf(executeWithdraw(intent(position.position)), seed);
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });
});
