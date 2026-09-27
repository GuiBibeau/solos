// @ts-check
import { Effect } from "effect";
import { ValidationError } from "../../shared/domain/errors.js";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import {
  CloseTokenAccountExecuteInputSchema,
  CloseTokenAccountInputSchema,
} from "../domain/types.js";

/**
 * @template {import("zod").ZodType} S
 * @param {S} schema
 * @param {unknown} input
 * @returns {Effect.Effect<import("zod").infer<S>, ValidationError>}
 */
const parsed = (schema, input) => {
  const result = schema.safeParse(input);
  if (result.success) return Effect.succeed(result.data);
  const issue = result.error.issues[0];
  return Effect.fail(
    new ValidationError({
      field: String(issue?.path.join(".") ?? "account"),
      value: input,
      reason: issue?.message ?? "invalid close_token_account input",
    }),
  );
};

/**
 * Simulate closing one token account the signer owns: the executor reads the account on chain,
 * refuses anything it may not close, and reports what the close would return. Nothing is sent.
 * @param {import("../domain/types.js").CloseTokenAccountInput} input
 */
export const simulateCloseTokenAccount = (input) =>
  Effect.gen(function* () {
    const { account } = yield* parsed(CloseTokenAccountInputSchema, input);
    return yield* simulateAction({ action: { type: "close_token_account", account } });
  }).pipe(Effect.withSpan("wallet.simulateCloseTokenAccount"));

/**
 * Close one token account the signer owns and wait for confirmation. The rent returns to the
 * signer, and a wrapped-SOL account's whole balance returns as native SOL.
 * @param {import("../domain/types.js").CloseTokenAccountExecuteInput} input
 */
export const executeCloseTokenAccount = (input) =>
  Effect.gen(function* () {
    const { account, skipSimulation } = yield* parsed(CloseTokenAccountExecuteInputSchema, input);
    return yield* executeAction({
      action: { type: "close_token_account", account },
      skipSimulation,
      event: "wallet.token_account_closed",
    });
  }).pipe(Effect.withSpan("wallet.executeCloseTokenAccount"));
