// @ts-check
import { surfnetCheatcodes } from "@solos/solana/surfnet";
import { Effect } from "effect";

/**
 * @typedef {{
 *   readonly rpcUrl: string;
 *   readonly prices: Readonly<Record<string, { readonly usd: string; readonly decimals: number }>>;
 *   readonly balances: Readonly<Record<string, string>>;
 * }} SwapFixtureConfig
 */

/**
 * Mutable fill book for one engine process. A swap lands a real signature, then these
 * Surfpool token accounts move to the fill.
 * @typedef {{
 *   readonly config: SwapFixtureConfig;
 *   readonly balances: Record<string, string>;
 *   readonly cheats: ReturnType<typeof surfnetCheatcodes>;
 *   readonly signer: import("@solos/core/wallet").SignerShape;
 * }} SwapLedger
 */

/**
 * @param {SwapFixtureConfig} config
 * @param {import("@solos/core/wallet").SignerShape} signer
 * @returns {SwapLedger}
 */
export const openSwapLedger = (config, signer) => ({
  config,
  balances: { ...config.balances },
  cheats: surfnetCheatcodes(config.rpcUrl),
  signer,
});

/**
 * @param {SwapLedger | undefined} ledger
 * @param {import("@solos/core/shared").ActionExecutorShape} executor
 * @param {{ readonly intentId: string; readonly action: import("@solos-sh/actions").Action }} input
 */
export const runSwapOrExecute = (ledger, executor, input) => {
  if (ledger === undefined || input.action.type !== "swap") {
    return executor.execute(input.action, { skipSimulation: false, intentId: input.intentId });
  }
  return executeSwap({ ...ledger, executor, input });
};

/**
 * @param {{
 *   config: SwapFixtureConfig;
 *   balances: Record<string, string>;
 *   cheats: ReturnType<typeof surfnetCheatcodes>;
 *   signer: import("@solos/core/wallet").SignerShape;
 *   executor: import("@solos/core/shared").ActionExecutorShape;
 *   input: { readonly intentId: string; readonly action: import("@solos-sh/actions").Action };
 * }} parts
 */
const executeSwap = (parts) =>
  Effect.gen(function* () {
    const owner = yield* parts.signer.address();
    const landed = yield* parts.executor.execute(
      { type: "transfer_sol", to: owner, lamports: "1" },
      { skipSimulation: false, intentId: parts.input.intentId },
    );
    if (!isConfirmed(landed)) return landed;
    yield* Effect.tryPromise({
      try: () => applyLeg(parts, owner, parts.input.action),
      catch: (error) => error,
    });
    return { ...landed, action: parts.input.action };
  });

/** @param {import("@solos-sh/actions").ExecutionResult} result */
const isConfirmed = (result) =>
  result.status === "confirmed" && result.signature !== null && result.signature.length > 0;

/**
 * @param {{
 *   config: SwapFixtureConfig;
 *   balances: Record<string, string>;
 *   cheats: ReturnType<typeof surfnetCheatcodes>;
 * }} parts
 * @param {string} owner
 * @param {import("@solos-sh/actions").Action} action
 */
const applyLeg = async (parts, owner, action) => {
  if (action.type !== "swap") return;
  const nextIn = spent(parts.balances[action.inputMint], action.amount);
  const nextOut = received(
    parts.balances[action.outputMint],
    outputBase(action, parts.config.prices),
  );
  parts.balances[action.inputMint] = nextIn;
  parts.balances[action.outputMint] = nextOut;
  await parts.cheats.setTokenAccount(owner, action.inputMint, nextIn);
  if (action.outputMint !== action.inputMint) {
    await parts.cheats.setTokenAccount(owner, action.outputMint, nextOut);
  }
};

/** @param {string | undefined} current @param {string} amount */
const spent = (current, amount) => {
  const next = BigInt(current ?? "0") - BigInt(amount);
  return (next < 0n ? 0n : next).toString();
};

/** @param {string | undefined} current @param {bigint} amount */
const received = (current, amount) => (BigInt(current ?? "0") + amount).toString();

/**
 * Output base units at the fixture's prices, floored.
 * @param {import("@solos-sh/actions").SwapAction} action
 * @param {SwapFixtureConfig["prices"]} prices
 */
const outputBase = (action, prices) => {
  const input = prices[action.inputMint];
  const output = prices[action.outputMint];
  if (input === undefined || output === undefined) return 0n;
  const outPrice = units(output.usd);
  if (outPrice === 0n) return 0n;
  const numerator = BigInt(action.amount) * units(input.usd) * 10n ** BigInt(output.decimals);
  return numerator / (outPrice * 10n ** BigInt(input.decimals));
};

/** Six-decimal integer of a USD price. @param {string} usd */
const units = (usd) => {
  const [whole, frac = ""] = usd.split(".", 2);
  return BigInt(`${whole || "0"}${frac.slice(0, 6).padEnd(6, "0")}`);
};
