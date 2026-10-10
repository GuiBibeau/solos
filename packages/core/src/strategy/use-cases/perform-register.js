// @ts-check
import { StrategySchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { allowlistRefusal, widenedMint } from "../domain/allowlist.js";
import { floorRefusal, nextInstant } from "../domain/cadence.js";
import { CadenceFloor } from "../ports/cadence-floor.js";
import { EngineAllowlist } from "../ports/engine-allowlist.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { parseDraft } from "./parse-draft.js";

/** @param {unknown} input */
export const performRegister = (input) =>
  Effect.gen(function* () {
    const draft = yield* parseDraft(input);
    const widened = yield* allowlistBlock(draft);
    if (widened !== undefined) return yield* widened;
    const interval = floorRefusal(draft.tickSource, (yield* CadenceFloor).minIntervalMs);
    if (interval !== undefined) return yield* interval;
    const ids = yield* StrategyIds;
    const createdAt = yield* ids.now();
    const strategy = scheduled(stored(draft, yield* ids.ulid(), createdAt), createdAt);
    yield* (yield* StrategyRepository).save(strategy);
    return { id: strategy.id, state: /** @type {const} */ ("active") };
  }).pipe(Effect.withSpan("strategy.register"));

/** @param {import("@solos-sh/actions").StrategyDraft} draft */
const allowlistBlock = (draft) =>
  Effect.gen(function* () {
    const allowlist = yield* EngineAllowlist;
    const mint = widenedMint(draft.bounds.allowedMints, allowlist.mints);
    if (mint === undefined) return undefined;
    return allowlistRefusal(mint, allowlist.mints);
  });

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

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {number} now
 */
const scheduled = (strategy, now) => ({ ...strategy, nextDueAt: nextInstant(strategy, now) ?? null });
