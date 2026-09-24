// @ts-check
import {
  decodeTokenAccount,
  decodeTrader,
  PHOENIX_PROGRAM_ADDRESS,
  SPL_TOKEN_PROGRAM_ADDRESS,
} from "@ellipsis-labs/rise";
import { getBase64EncodedWireTransaction } from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { assertV1WireForSubmission } from "../executor/transaction-v1.js";
import { base64AccountData } from "../market/mint-account.js";
import { rpcCall } from "../rpc/rpc-call.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("effect").Effect.Effect.Success<ReturnType<typeof import("./phoenix-collateral-build.js").buildCollateral>>} Plan */
/** @typedef {import("@solos/actions").PerpCollateralQuote} Quote */

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

/** Simulate the exact signed wire and fail closed if RPC omits any account needed for quote.
 * @param {Rpc} ctx @param {Plan} plan */
export const preflightCollateral = (ctx, plan) =>
  Effect.gen(function* () {
    const wire = yield* Effect.try({
      try: () => {
        const encoded = getBase64EncodedWireTransaction(plan.signed);
        assertV1WireForSubmission(encoded);
        return encoded;
      },
      catch: () => new BuildRejected({ reason: "Phoenix collateral signed wire is invalid" }),
    });
    const { value } = yield* rpcCall("simulateTransaction", ctx.url, () =>
      ctx.rpc
        .simulateTransaction(wire, {
          encoding: "base64",
          sigVerify: false,
          accounts: {
            addresses: [plan.facts.owner, plan.facts.atas.usdc, plan.facts.trader],
            encoding: "base64",
          },
        })
        .send(),
    );
    const raw = {
      err: value.err,
      logs: [...(value.logs ?? [])],
      unitsConsumed: (value.unitsConsumed ?? 0n).toString(),
    };
    if (raw.err !== null) return { ...raw, quote: null };
    const quote = yield* Effect.try({
      try: () => estimate(plan, value.accounts),
      catch: () =>
        new BuildRejected({ reason: "Phoenix collateral output could not be safely estimated" }),
    });
    return { ...raw, quote };
  });
