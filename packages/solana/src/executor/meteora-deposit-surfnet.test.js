// @ts-check
/**
 * Meteora `add_liquidity2` through the real deposit executor on an offline Surfnet.
 * The program is the mainnet one, the accounts are synthetic, and a successful simulation
 * is not submitted: this file never calls execute on a build that might land.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getBase64Codec, getTransactionDecoder } from "@solana/kit";
import { BuildRejected, executeDeposit, simulateDeposit } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { randomAddress } from "../liquidity/liquidity-token-fixture.js";
import { ADD_LIQUIDITY2_DISCRIMINATOR } from "../liquidity/meteora-dlmm-instruction.js";
import { METEORA_DLMM_PROGRAM } from "../liquidity/meteora-dlmm-program.js";
import {
  seedMeteoraBinArray,
  seedMeteoraPair,
  seedMeteoraPosition,
} from "../liquidity/meteora-dlmm-seeds.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { surfnetCheatcodes } from "../surfnet/surfnet-cli.js";
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** @type {(seed: Uint8Array) => import("effect").Layer.Layer<any>} */
let layer;

const BUDGET = "1000000000";

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  layer = (seed) => SolanaTestLive({ rpcUrl: rpc.url, wsUrl: surfnet.wsUrl, seed });
});

afterAll(() => {
  rpc.stop();
});

/**
 * @param {string} owner
 * @param {{ positionOwner?: string; amountX?: number }} [options]
 */
const seedDeposit = async (owner, options = {}) => {
  const mintX = randomAddress();
  const mintY = randomAddress();
  const pair = await seedMeteoraPair(surfnet.rpcUrl, {
    mintX,
    mintY,
    activeId: 0,
    binStep: 1,
    reserveX: randomAddress(),
    reserveY: randomAddress(),
  });
  const position = await seedMeteoraPosition(surfnet.rpcUrl, {
    lbPair: pair,
    owner: options.positionOwner ?? owner,
    lowerBinId: 0,
    upperBinId: 0,
  });
  await seedMeteoraBinArray(surfnet.rpcUrl, { lbPair: pair, index: 0 });
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  await cheats.setTokenAccount(owner, mintX, options.amountX ?? 1_000_000_000_000);
  await cheats.setTokenAccount(owner, mintY, 1_000_000_000_000);
  return { pair, position };
};

/** @param {string} pool @param {string} position */
const intent = (pool, position) => ({
  protocol: /** @type {const} */ ("meteora"),
  pool,
  position,
  amountA: BUDGET,
  amountB: BUDGET,
  maxSlippageBps: 50,
});

/**
 * @param {import("effect").Effect.Effect<unknown, unknown, never>} effect
 * @param {Uint8Array} seed
 */
const failureOf = async (effect, seed) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer(seed)));
  if (exit._tag !== "Failure") return null;
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) throw new Error(`not a failure value: ${String(exit.cause)}`);
  return Option.getOrThrow(failure);
};

/** The last simulated transaction's Meteora instruction, if the build reached simulation. */
const simulatedInstruction = async () => {
  const calls = rpc.callsFor("simulateTransaction");
  const wireBase64 = /** @type {string} */ (
    /** @type {{ params?: unknown[] }} */ (calls.at(-1))?.params?.[0]
  );
  const transaction = getTransactionDecoder().decode(getBase64Codec().encode(wireBase64));
  const kit = await import("@solana/kit");
  const compiled = kit.getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const message = kit.decompileTransactionMessage(
    /** @type {Parameters<typeof kit.decompileTransactionMessage>[0]} */ (compiled),
  );
  return message.instructions.find((ix) => String(ix.programAddress) === METEORA_DLMM_PROGRAM);
};

/** @param {Uint8Array} data @param {number} offset */
const u64At = (data, offset) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);

describe("meteora liquidity deposit against Surfnet [integration]", () => {
  test("a seeded deposit simulates an add_liquidity2 whose amounts stay inside the budgets and sends nothing", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const { pair, position } = await seedDeposit(owner);
    const sends = rpc.callsFor("sendTransaction").length;
    const sims = rpc.callsFor("simulateTransaction").length;
    await failureOf(simulateDeposit(intent(pair, position)), seed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims + 1);
    const instruction = await simulatedInstruction();
    expect(instruction).toBeDefined();
    if (!instruction) return;
    expect(instruction.data.slice(0, 8)).toEqual(Uint8Array.from(ADD_LIQUIDITY2_DISCRIMINATOR));
    expect(u64At(instruction.data, 8) <= BigInt(BUDGET)).toBe(true);
    expect(u64At(instruction.data, 16) <= BigInt(BUDGET)).toBe(true);
    const accounts = instruction.accounts?.map((meta) =>
      typeof meta === "string" ? meta : String(meta.address),
    );
    expect(accounts).toContain(position);
  });

  test("a wrong owner and an insufficient balance send nothing and do not simulate", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const sends = rpc.callsFor("sendTransaction").length;
    const sims = rpc.callsFor("simulateTransaction").length;
    const foreign = await seedDeposit(owner, { positionOwner: randomAddress() });
    const unowned = await failureOf(simulateDeposit(intent(foreign.pair, foreign.position)), seed);
    expect(unowned).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (unowned).reason).toContain("does not own");

    const short = await seedDeposit(owner, { amountX: 1 });
    const broke = await failureOf(simulateDeposit(intent(short.pair, short.position)), seed);
    expect(broke).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (broke).reason).toContain("insufficient token A");
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);

    const executed = await failureOf(executeDeposit(intent(foreign.pair, foreign.position)), seed);
    expect(executed).toBeInstanceOf(BuildRejected);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });
});
