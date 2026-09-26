// @ts-check
/**
 * Funding a wSOL side by wrapping native SOL, through the real executor over Surfnet.
 *
 * The wallet shape under test is the ordinary one: native SOL, no wSOL token account. Before
 * `wrapSol` that wallet could not fund any SOL-paired position on any venue, which is most of
 * the concentrated liquidity there is.
 *
 * These cases prove the build reaches simulation with the flag and is refused without it. What
 * the transaction actually contains — a plain create rather than an idempotent one, so a lost
 * race aborts instead of closing an account it did not make — is pinned in `wrap-sol.test.js`,
 * where it can be asserted rather than inferred from a simulation outcome.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BuildRejected, SimulationFailed, simulateOpenPosition } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { randomAddress } from "../liquidity/liquidity-seeds.js";
import { seedRaydiumPool } from "../liquidity/raydium-clmm-seeds.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { surfnetCheatcodes } from "../surfnet/surfnet-cli.js";
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";
import { WSOL_MINT } from "./wrap-sol.js";

const TICK_SPACING = 60;

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

/**
 * A SOL-paired pool, a signer holding native SOL, and the non-SOL side funded — everything an
 * open needs except the wSOL the venue actually takes.
 */
const solPairedFixture = async () => {
  const seed = randomSeed();
  const owner = await seedAddress(seed);
  const mint1 = randomAddress();
  const pool = await seedRaydiumPool(surfnet.rpcUrl, {
    mint0: WSOL_MINT,
    mint1,
    tickSpacing: TICK_SPACING,
  });
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  await cheats.setTokenAccount(owner, mint1, 10n ** 12n);
  await cheats.fundSol(owner, 5);
  return { seed, pool };
};

/** @param {string} pool */
const openIntent = (pool) => ({
  protocol: /** @type {"raydium"} */ ("raydium"),
  pool,
  tickLower: -600,
  tickUpper: 600,
  amountA: "1000000000",
  amountB: "1000000000",
  maxSlippageBps: 50,
});

/** @param {Effect.Effect<unknown, unknown, never>} effect @param {Uint8Array} seed */
const failureOf = async (effect, seed) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer(seed)));
  if (exit._tag !== "Failure") throw new Error("expected a domain failure");
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) throw new Error(`not a failure value: ${String(exit.cause)}`);
  return Option.getOrThrow(failure);
};

describe("wrapping a wSOL funding side over Surfnet [integration]", () => {
  test("a wSOL side with no token account is wrapped in the same transaction when asked", async () => {
    const { seed, pool } = await solPairedFixture();
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(
      simulateOpenPosition({ ...openIntent(pool), wrapSol: true }),
      seed,
    );
    // Reaching simulation is the whole point: the build no longer refuses for a balance the
    // transaction is about to create.
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims + 1);
  });

  test("the same wSOL side without the flag is refused, never wrapped silently", async () => {
    const { seed, pool } = await solPairedFixture();
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(simulateOpenPosition(openIntent(pool)), seed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("insufficient token A");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });
});
