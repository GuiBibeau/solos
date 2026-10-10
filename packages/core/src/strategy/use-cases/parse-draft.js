// @ts-check
import { StrategyDraftSchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { StrategyInvalid } from "../domain/errors.js";

/**
 * @param {unknown} input
 * @returns {import("effect").Effect.Effect<import("@solos-sh/actions").StrategyDraft, StrategyInvalid>}
 */
export const parseDraft = (input) => {
  const parsed = StrategyDraftSchema.safeParse(input);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => issue.message).join("; ");
    return Effect.fail(new StrategyInvalid({ reason }));
  }
  return Effect.succeed(parsed.data);
};
