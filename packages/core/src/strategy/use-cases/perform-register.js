// @ts-check
import { StrategySchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { allowlistRefusal, widenedMint } from "../domain/allowlist.js";
import { floorRefusal } from "../domain/cadence.js";
import { nextDueInstant } from "../domain/next-instant.js";
import { unsupportedStrategyAction } from "../domain/supported-action.js";
import { CadenceFloor } from "../ports/cadence-floor.js";
import { EngineAllowlist } from "../ports/engine-allowlist.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { parseDraft } from "./parse-draft.js";

/** @param {unknown} input */
export const performRegister = (input) =>
  Effect.gen(function* () {
    const draft = yield* parseDraft(input);
    const refused = refusedAction(draft);
    if (refused !== undefined) return yield* refused;
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
const refusedAction = (draft) => {
  if (draft.kind === "schedule") return refusedIn(draft.params.actions);
  if (draft.kind === "trigger") return unsupportedStrategyAction(draft.params.action.type);
  return undefined;
};

/** @param {ReadonlyArray<{ readonly type: string }>} actions */
const refusedIn = (actions) => {
  for (const action of actions) {
    const refused = unsupportedStrategyAction(action.type);
    if (refused !== undefined) return refused;
  }
  return undefined;
};

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
const scheduled = (strategy, now) => ({
  ...strategy,
  nextDueAt: nextDueInstant(strategy, now) ?? null,
});
