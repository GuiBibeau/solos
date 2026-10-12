// @ts-check
/**
 * Transfer-hook guard through the Surfpool-backed Meteora deposit and withdraw adapters.
 * Mint bytes are written on the offline chain and read back with getMultipleAccounts, so a
 * refusal is the executor's BuildRejected and not a stubbed plan. Nothing here is sent.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getBase64Codec, getTransactionDecoder } from "@solana/kit";
import {
  BuildRejected,
  executeDeposit,
  executeWithdraw,
  simulateDeposit,
  simulateWithdraw,
} from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { accountWriter } from "../liquidity/liquidity-seeds.js";
import { randomAddress, tokenBytes } from "../liquidity/liquidity-token-fixture.js";
import { ADD_LIQUIDITY2_DISCRIMINATOR } from "../liquidity/meteora-dlmm-instruction.js";
import { METEORA_DLMM_PROGRAM } from "../liquidity/meteora-dlmm-program.js";
import { REBALANCE_LIQUIDITY_DISCRIMINATOR } from "../liquidity/meteora-dlmm-rebalance.js";
import {
  seedMeteoraBinArray,
  seedMeteoraPair,
  seedMeteoraPosition,
} from "../liquidity/meteora-dlmm-seeds.js";
import { ata } from "../liquidity/raydium-clmm-plan-reads.js";
import { TOKEN_2022_PROGRAM } from "../market/mint-account.js";
import { tlvRecord, token2022MintBytes, zeros } from "../market/test-fixtures.js";
import { TRANSFER_HOOK } from "../market/token-2022-layout.js";
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
const FUND = 1_000_000_000_000n;
const HOOK_REMEDY = "use a pool whose mints have no transfer-hook program";

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  layer = (seed) => SolanaTestLive({ rpcUrl: rpc.url, wsUrl: surfnet.wsUrl, seed });
});

afterAll(() => {
  rpc.stop();
});

/** @param {boolean} active */
const hookMint = (active) => {
  const value = zeros(64);
  if (active) value[63] = 1;
  return token2022MintBytes({ decimals: 9, records: [tlvRecord(TRANSFER_HOOK, value)] });
};

/** @param {boolean} wide */
const windowOf = (wide) =>
  wide
    ? { lowerBinId: 7, upperBinId: 11, activeId: 9, bins: [7, 8, 9, 10, 11] }
    : { lowerBinId: 0, upperBinId: 0, activeId: 0, bins: [0] };

/** @param {readonly number[]} bins */
const occupied = (bins) => bins.map((_binId, index) => ({ index, share: 1_000_000n }));

/** @param {readonly number[]} bins */
const seededBins = (bins) =>
  bins.map((binId) => ({
    binId,
    amountX: 1_000_000n,
    amountY: 1_000_000n,
    supply: 1_000_000n,
  }));

/**
 * One Token-2022 mint X (hook on or off) beside a classic mint Y, with balances at both ATAs.
 * @param {string} owner
 * @param {{ active: boolean; wide: boolean }} options
 */
const seedHookedPool = async (owner, options) => {
  const mintX = randomAddress();
  const mintY = randomAddress();
  const window = windowOf(options.wide);
  const pair = await seedMeteoraPair(surfnet.rpcUrl, {
    mintX,
    mintY,
    activeId: window.activeId,
    binStep: 1,
    reserveX: randomAddress(),
    reserveY: randomAddress(),
  });
  const write = accountWriter(surfnet.rpcUrl);
  await write(mintX, TOKEN_2022_PROGRAM, hookMint(options.active));
  const position = await seedMeteoraPosition(surfnet.rpcUrl, {
    lbPair: pair,
    owner,
    lowerBinId: window.lowerBinId,
    upperBinId: window.upperBinId,
    shares: occupied(window.bins),
  });
  await seedMeteoraBinArray(surfnet.rpcUrl, {
    lbPair: pair,
    index: 0,
    bins: seededBins(window.bins),
  });
  const userX = await ata(owner, mintX, TOKEN_2022_PROGRAM);
  await write(userX, TOKEN_2022_PROGRAM, tokenBytes(owner, mintX, FUND));
  await surfnetCheatcodes(surfnet.rpcUrl).setTokenAccount(owner, mintY, Number(FUND));
  return { pair, position, mintX };
};

/** @param {string} pool @param {string} position */
const depositIntent = (pool, position) => ({
  protocol: /** @type {const} */ ("meteora"),
  pool,
  position,
  amountA: BUDGET,
  amountB: BUDGET,
  maxSlippageBps: 50,
});

/** @param {string} position */
const withdrawIntent = (position) => ({
  protocol: /** @type {const} */ ("meteora"),
  position,
  bps: 10_000,
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

const traffic = () => ({
  sends: rpc.callsFor("sendTransaction").length,
  sims: rpc.callsFor("simulateTransaction").length,
});

/** @param {string} account */
const fetchedAccount = (account) =>
  rpc
    .callsFor("getMultipleAccounts")
    .some((call) => call.params.some((param) => Array.isArray(param) && param.includes(account)));

/**
 * @param {unknown} failure
 * @param {string} mint
 */
const hookRefusal = (failure, mint) => {
  expect(failure).toBeInstanceOf(BuildRejected);
  const rejected = /** @type {BuildRejected} */ (failure);
  expect(rejected.reason).toContain(mint);
  expect(rejected.reason).toContain("transfer hook");
  expect(rejected.remedy).toBe(HOOK_REMEDY);
};

/** The last simulated transaction's Meteora instruction. */
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

/** @param {{ accounts?: readonly (string | { address?: unknown })[] }} instruction @param {number} index */
const accountAt = (instruction, index) => {
  const meta = instruction.accounts?.[index];
  return typeof meta === "string" ? meta : String(meta?.address);
};

describe("meteora transfer-hook guard against Surfnet [integration]", () => {
  test("an active hook fetched from RPC is refused before deposit or withdraw signs", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const before = traffic();
    const deposit = await seedHookedPool(owner, { active: true, wide: false });
    const deposited = await failureOf(
      simulateDeposit(depositIntent(deposit.pair, deposit.position)),
      seed,
    );
    hookRefusal(deposited, deposit.mintX);
    expect(fetchedAccount(deposit.mintX)).toBe(true);

    const withdraw = await seedHookedPool(owner, { active: true, wide: false });
    const withdrawn = await failureOf(simulateWithdraw(withdrawIntent(withdraw.position)), seed);
    hookRefusal(withdrawn, withdraw.mintX);
    expect(fetchedAccount(withdraw.mintX)).toBe(true);

    const executedDeposit = await failureOf(
      executeDeposit(depositIntent(deposit.pair, deposit.position)),
      seed,
    );
    hookRefusal(executedDeposit, deposit.mintX);
    const executedWithdraw = await failureOf(
      executeWithdraw(withdrawIntent(withdraw.position)),
      seed,
    );
    hookRefusal(executedWithdraw, withdraw.mintX);
    expect(rpc.callsFor("sendTransaction").length).toBe(before.sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(before.sims);
  });

  test("a zero program id is disabled, so the deposit simulates with the token-2022 program", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const before = traffic();
    const { pair, position, mintX } = await seedHookedPool(owner, { active: false, wide: false });
    const failure = await failureOf(simulateDeposit(depositIntent(pair, position)), seed);
    expect(failure).not.toBeInstanceOf(BuildRejected);
    expect(rpc.callsFor("sendTransaction").length).toBe(before.sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(before.sims + 1);
    expect(fetchedAccount(mintX)).toBe(true);
    const instruction = await simulatedInstruction();
    expect(instruction).toBeDefined();
    if (!instruction) return;
    expect(instruction.data.slice(0, 8)).toEqual(Uint8Array.from(ADD_LIQUIDITY2_DISCRIMINATOR));
    expect(accountAt(instruction, 10)).toBe(TOKEN_2022_PROGRAM);
  });

  test("a disabled hook still withdraws, and bins 7 through 11 collapse to one range", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const before = traffic();
    const { position, mintX } = await seedHookedPool(owner, { active: false, wide: true });
    const failure = await failureOf(simulateWithdraw(withdrawIntent(position)), seed);
    expect(failure).not.toBeInstanceOf(BuildRejected);
    expect(rpc.callsFor("sendTransaction").length).toBe(before.sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(before.sims + 1);
    expect(fetchedAccount(mintX)).toBe(true);
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
    expect(view.getUint32(80, true)).toBe(1);
    expect(view.getInt32(85, true)).toBe(7);
    expect(view.getInt32(90, true)).toBe(11);
    expect(view.getUint16(94, true)).toBe(10_000);
    expect(accountAt(instruction, 11)).toBe(TOKEN_2022_PROGRAM);
  });
});
