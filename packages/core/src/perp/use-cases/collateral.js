// @ts-check
import {
  DepositPerpCollateralActionSchema,
  WithdrawPerpCollateralActionSchema,
} from "@solos-sh/actions";
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { PerpInputInvalid } from "../domain/errors.js";

/** @param {"deposit" | "withdraw"} direction @param {{ amount: string }} input */
const actionFor = (direction, input) =>
  Effect.try({
    try: () => {
      const isDeposit = direction === "deposit";
      const schema = isDeposit
        ? DepositPerpCollateralActionSchema
        : WithdrawPerpCollateralActionSchema;
      return schema.parse({
        type: isDeposit ? "deposit_perp_collateral" : "withdraw_perp_collateral",
        traderPdaIndex: 0,
        traderSubaccountIndex: 0,
        amount: input.amount,
      });
    },
    catch: () =>
      new PerpInputInvalid({ reason: "amount must be a positive u64 input base-unit string" }),
  });

/** Preview one exact wallet USDC input, not a guaranteed Phoenix token output.
 * @param {{ amount: string }} input */
export const simulatePerpDeposit = (input) =>
  Effect.flatMap(actionFor("deposit", input), (action) => simulateAction({ action })).pipe(
    Effect.withSpan("perp.simulateDepositCollateral"),
  );

/** Explicitly debit wallet USDC after simulation, never inside an order operation.
 * @param {{ amount: string }} input */
export const executePerpDeposit = (input) =>
  Effect.flatMap(actionFor("deposit", input), (action) =>
    executeAction({ action, event: "perp.collateralDeposited" }),
  ).pipe(Effect.withSpan("perp.executeDepositCollateral"));

/** Preview a fixed Phoenix collateral-token input, not a guaranteed USDC receipt.
 * @param {{ amount: string }} input */
export const simulatePerpWithdrawal = (input) =>
  Effect.flatMap(actionFor("withdraw", input), (action) => simulateAction({ action })).pipe(
    Effect.withSpan("perp.simulateWithdrawCollateral"),
  );

/** Explicitly debit trader collateral after all-market risk checks and simulation.
 * @param {{ amount: string }} input */
export const executePerpWithdrawal = (input) =>
  Effect.flatMap(actionFor("withdraw", input), (action) =>
    executeAction({ action, event: "perp.collateralWithdrawn" }),
  ).pipe(Effect.withSpan("perp.executeWithdrawCollateral"));
