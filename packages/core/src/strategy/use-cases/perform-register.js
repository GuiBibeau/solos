// @ts-check
import { StrategySchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { allowlistRefusal, widenedMint } from "../domain/allowlist.js";
import { EngineAllowlist } from "../ports/engine-allowlist.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { parseDraft } from "./parse-draft.js";

/** @param {unknown} input */
export const performRegister = (input) =>
  Effect.gen(function* () {
    const draft = yield* parseDraft(input);
    const allowlist = yield* EngineAllowlist;
    const mint = widenedMint(draft.bounds.allowedMints, allowlist.mints);
    if (mint !== undefined) return yield* allowlistRefusal(mint, allowlist.mints);
    const ids = yield* StrategyIds;
    const strategy = stored(draft, yield* ids.ulid(), yield* ids.now());
    yield* (yield* StrategyRepository).save(strategy);
    return { id: strategy.id, state: /** @type {const} */ ("active") };
  }).pipe(Effect.withSpan("strategy.register"));

/**
 * @param {import("@solos-sh/actions").StrategyDraft} draft
 * @param {string} id
 * @param {number} createdAt
 */
const stored = (draft, id, createdAt) => {
  const strategy = StrategySchema.parse({
    ...draft,
    schemaVersion: 1,
    id,
    state: "active",
    createdAt,
    expiresAt: draft.bounds.expiresAt,
  });
  return strategy;
};
