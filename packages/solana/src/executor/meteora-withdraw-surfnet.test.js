// @ts-check
/**
 * Meteora remove-only `rebalance_liquidity` through the real withdraw executor on an
 * offline Surfnet. The program is the mainnet one, the accounts are synthetic, and a
 * failed simulation is not submitted: this file never lets a build that might land call send.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getBase64Codec, getTransactionDecoder } from "@solana/kit";
import { BuildRejected, executeWithdraw, SimulationFailed, simulateWithdraw } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { randomAddress } from "../liquidity/liquidity-token-fixture.js";
import { METEORA_DLMM_PROGRAM } from "../liquidity/meteora-dlmm-program.js";
import { REBALANCE_LIQUIDITY_DISCRIMINATOR } from "../liquidity/meteora-dlmm-rebalance.js";
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
 * @param {{ positionOwner?: string; shares?: readonly { index: number; share: bigint }[] }} [options]
 */
const seedRemoval = async (owner, options = {}) => {
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
    shares: options.shares ?? [{ index: 0, share: 1_000_000n }],
  });
  await seedMeteoraBinArray(surfnet.rpcUrl, {
    lbPair: pair,
    index: 0,
    bins: [{ binId: 0, amountX: 1_000_000n, amountY: 1_000_000n, supply: 1_000_000n }],
  });
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  await cheats.setTokenAccount(owner, mintX, 1_000_000_000_000);
  await cheats.setTokenAccount(owner, mintY, 1_000_000_000_000);
  return { pair, position };
};

/** @param {string} position @param {number} [bps] */
const intent = (position, bps = 10_000) => ({
  protocol: /** @type {const} */ ("meteora"),
  position,
  bps,
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

describe("meteora liquidity withdraw against Surfnet [integration]", () => {
  test("a seeded full exit simulates remove-only rebalance and sends nothing", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const { position } = await seedRemoval(owner);
    const sends = rpc.callsFor("sendTransaction").length;
    const sims = rpc.callsFor("simulateTransaction").length;
    const simulated = await failureOf(simulateWithdraw(intent(position)), seed);
    expect(simulated).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims + 1);
    const instruction = await simulatedInstruction();
    expect(instruction).toBeDefined();
    if (!instruction) return;
    expect(instruction.data.slice(0, 8)).toEqual(
      Uint8Array.from(REBALANCE_LIQUIDITY_DISCRIMINATOR),
    );
    const view = new DataView(
      instruction.data.buffer,
      instruction.data.byteOffset,
      instruction.data.byteLength,
    );
    expect(view.getUint8(14)).toBe(0);
    expect(view.getUint8(15)).toBe(0);
    expect(view.getUint8(48)).toBe(3);
    expect(view.getUint16(94, true)).toBe(10_000);
    const accounts = instruction.accounts?.map((meta) =>
      typeof meta === "string" ? meta : String(meta.address),
    );
    expect(accounts).toContain(position);
  });

  test("a wrong owner and an empty position send nothing and do not simulate", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const sends = rpc.callsFor("sendTransaction").length;
    const sims = rpc.callsFor("simulateTransaction").length;
    const foreign = await seedRemoval(owner, { positionOwner: randomAddress() });
    const unowned = await failureOf(simulateWithdraw(intent(foreign.position)), seed);
    expect(unowned).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (unowned).reason).toContain("does not own");

    const empty = await seedRemoval(owner, { shares: [] });
    const bare = await failureOf(simulateWithdraw(intent(empty.position)), seed);
    expect(bare).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (bare).reason).toContain("zero liquidity");
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);

    const executed = await failureOf(executeWithdraw(intent(foreign.position)), seed);
    expect(executed).toBeInstanceOf(BuildRejected);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);

    const funded = await seedRemoval(owner);
    const refused = await failureOf(executeWithdraw(intent(funded.position)), seed);
    expect(refused).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });
});
