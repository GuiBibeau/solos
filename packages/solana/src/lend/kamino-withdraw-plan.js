// @ts-check
import { Effect } from "effect";
import { associatedTokenAccount, vanillaObligationAddress } from "./kamino-deposit-addresses.js";
import { kaminoDepositSdk } from "./kamino-deposit-facts.js";
import { checkedWithdrawRows } from "./kamino-withdraw-guards.js";
import { withdrawInstructions } from "./kamino-withdraw-instructions.js";
import { exactCollateralForWithdrawal } from "./kamino-withdraw-math.js";

/** @typedef {import("./kamino-deposit-plan.js").DepositReader} Reader */
/** @typedef {import("./kamino-deposit-plan.js").DepositIntent} Intent */
/** @typedef {import("./kamino-deposit-plan.js").ReserveFacts} Facts */
/** @typedef {{ readonly status: "reject"; readonly reason: string }} Rejection */
/** @typedef {{ readonly status: "ok"; readonly instructions: readonly { programAddress: string }[]; readonly destination: string; readonly quote: import("@solos/actions").LendWithdrawQuote }} WithdrawalPlan */

/** @param {string} reason @returns {Rejection} */
const reject = (reason) => ({ status: "reject", reason });

/** @param {{ intent: Intent; facts: Facts; obligation: string; collateral: bigint }} parts @returns {import("@solos/actions").LendWithdrawQuote} */
const withdrawalQuote = ({ intent, facts, obligation, collateral }) => ({
  kind: "lend_withdraw",
  reserve: facts.reserve,
  obligation,
  requestedLiquidity: intent.amount.toString(),
  collateralAmount: collateral.toString(),
  estimatedLiquidity: intent.amount.toString(),
  exchangeRate: facts.exchangeRate,
  feeLamports: "5000",
});

/**
 * Preflight the signer's existing vanilla position against a pinned read-time reserve rate.
 * No init, borrow, repay, sentinel maximum, or automatic multi-obligation withdrawal.
 * @param {{ reader: Reader; intent: Intent; facts: Facts; signer: import("../signer/kit-signer.js").KitCompatibleSigner }} input
 * @returns {import("effect").Effect.Effect<WithdrawalPlan | Rejection, import("@solos/core").RpcError>}
 */
export const withdrawPlan = ({ reader, intent, facts, signer }) =>
  Effect.gen(function* () {
    if (facts.liquidityMint !== intent.mint)
      return reject("reserve mint does not match the requested mint");
    if (intent.amount > BigInt(facts.availableLiquidity))
      return reject("insufficient redeemable reserve liquidity");
    const collateral = exactCollateralForWithdrawal(intent.amount, facts.exchangeRate);
    if (collateral === null)
      return reject("the requested underlying amount cannot be redeemed exactly in receipt units");
    const [obligation, destination] = yield* Effect.promise(() =>
      Promise.all([
        vanillaObligationAddress(intent.owner, intent.market),
        associatedTokenAccount(intent.owner, intent.mint, facts.liquidityTokenProgram),
      ]),
    );
    const rows = yield* checkedWithdrawRows({ reader, intent, facts, obligation, destination });
    if ("reason" in rows) return rows;
    if (collateral > rows.balance)
      return reject("insufficient collateral in the plain supply obligation");
    const sdk = yield* Effect.promise(() => kaminoDepositSdk());
    const instructions = withdrawInstructions(sdk, {
      intent,
      signer,
      facts,
      obligation,
      destination,
      collateral,
      collateralProgram: rows.collateralProgram,
      reserves: rows.reserves,
    });
    return {
      status: /** @type {const} */ ("ok"),
      instructions,
      destination,
      quote: withdrawalQuote({ intent, facts, obligation, collateral }),
    };
  }).pipe(Effect.withSpan("lend.withdrawPlan"));
