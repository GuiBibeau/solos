// @ts-check
import { Effect } from "effect";
import { Signer } from "../../wallet/index.js";
import { PortfolioInputInvalid } from "../domain/errors.js";
import { PortfolioStateInputSchema } from "../domain/types.js";
import { PortfolioReader } from "../ports/portfolio-reader.js";

/** @typedef {import("../domain/errors.js").PortfolioError | import("../../shared/index.js").SignerUnavailable} GetStateError */
/** @typedef {import("../ports/portfolio-reader.js").PortfolioReaderShape | import("../../wallet/index.js").SignerShape} GetStateContext */

/**
 * Assemble one owner's supported-portfolio state (ADR-0018). Complete or failed: a venue
 * that cannot enumerate raises its own typed failure, never a silent zero.
 * @param {import("../domain/types.js").PortfolioStateInput} input
 * @returns {import("effect").Effect.Effect<import("@solos-sh/actions").PortfolioState, GetStateError, GetStateContext>}
 */
export const getState = (input) =>
  Effect.gen(function* () {
    const parsed = PortfolioStateInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new PortfolioInputInvalid({
        reason: "owner must be a base58 address when given",
      });
    }
    const owner = parsed.data.owner ?? (yield* (yield* Signer).address());
    return yield* (yield* PortfolioReader).getState({ owner });
  }).pipe(Effect.withSpan("portfolio.getState"));
