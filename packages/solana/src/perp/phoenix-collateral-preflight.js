// @ts-check
import {
  decodeTokenAccount,
  decodeTrader,
  PHOENIX_PROGRAM_ADDRESS,
  SPL_TOKEN_PROGRAM_ADDRESS,
} from "@ellipsis-labs/rise";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { base64AccountData } from "../market/mint-account.js";

/** @typedef {import("effect").Effect.Effect.Success<ReturnType<typeof import("./phoenix-collateral-build.js").buildCollateral>>} Plan */
/** @typedef {import("@solos-sh/actions").PerpCollateralQuote} Quote */

/** @param {unknown} value @param {string} owner @param {string} mint */
const decodedWallet = (value, owner, mint) => {
  const account = /** @type {{owner:string,data:readonly [string,string]} | null} */ (value);
  if (!account || account.owner !== SPL_TOKEN_PROGRAM_ADDRESS) throw new Error("token owner");
  const state = decodeTokenAccount(base64AccountData(account.data));
  if (state.owner !== owner || state.mint !== mint || state.state !== 1)
    throw new Error("token custody");
  return state.amount;
};

/** @param {unknown} value @param {string} owner @param {string} trader */
const decodedTrader = (value, owner, trader) => {
  const account = /** @type {{owner:string,data:readonly [string,string]} | null} */ (value);
  if (!account || account.owner !== PHOENIX_PROGRAM_ADDRESS) throw new Error("trader owner");
  const state = decodeTrader(base64AccountData(account.data));
  if (state.authority !== owner || state.key !== trader) throw new Error("trader identity");
  return BigInt(state.state.quoteLotCollateral);
};

/** @param {Plan} plan @param {unknown} accounts */
const readSimulationAccounts = (plan, accounts) => {
  const { facts } = plan;
  const rows = /** @type {Array<unknown> | undefined} */ (accounts);
  const payer = /** @type {{lamports:bigint} | null} */ (rows?.[0]);
  if (!payer || typeof payer.lamports !== "bigint") throw new Error("payer unavailable");
  return {
    payerAfter: payer.lamports,
    walletAfter: decodedWallet(rows?.[1], facts.owner, facts.exchange.usdcMint),
    traderAfter: decodedTrader(rows?.[2], facts.owner, facts.trader),
  };
};

/** @param {{amount:bigint;direction:"deposit" | "withdraw";payerLamports:bigint}} facts @param {{inputDebit:bigint;output:bigint;payerAfter:bigint}} observed */
const assertEstimate = (facts, { inputDebit, output, payerAfter }) => {
  if (inputDebit !== facts.amount || output <= 0n || payerAfter > facts.payerLamports)
    throw new Error("simulation balance changes contradict fixed input");
};

/** @param {Plan} plan @param {unknown} accounts */
const estimate = (plan, accounts) => {
  const { facts } = plan;
  const { payerAfter, walletAfter, traderAfter } = readSimulationAccounts(plan, accounts);
  const traderBefore = BigInt(facts.state.state.quoteLotCollateral);
  const isDeposit = facts.direction === "deposit";
  const inputDebit = isDeposit ? facts.walletUsdc - walletAfter : traderBefore - traderAfter;
  const output = isDeposit ? traderAfter - traderBefore : walletAfter - facts.walletUsdc;
  assertEstimate(facts, { inputDebit, output, payerAfter });
  return /** @type {Quote} */ ({
    kind: "perp_collateral",
    direction: facts.direction,
    inputAmount: facts.amount.toString(),
    estimatedOutput: output.toString(),
    estimatedFeeLamports: (facts.payerLamports - payerAfter + 5000n).toString(),
    guaranteedMinimumOutput: false,
  });
};

/**
 * The Submission probe for a collateral transfer: the payer, wallet USDC and trader accounts
 * after the exact signed wire, turned into a quote. It fails closed when simulation omits any of
 * them or when the balance changes contradict the fixed input.
 * @param {Plan} plan
 * @returns {import("../submission/simulate.js").Probe}
 */
export const collateralProbe = (plan) => ({
  accounts: [plan.facts.owner, plan.facts.atas.usdc, plan.facts.trader],
  verdict: (outcome) =>
    Effect.try({
      try: () => estimate(plan, outcome.accounts),
      catch: () =>
        new BuildRejected({ reason: "Phoenix collateral output could not be safely estimated" }),
    }),
});
