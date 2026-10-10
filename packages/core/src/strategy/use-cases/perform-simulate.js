// @ts-check
import { Effect } from "effect";
import { getPrice } from "../../market/index.js";
import { allowlistRefusal, widenedMint } from "../domain/allowlist.js";
import { firstTickActions } from "../domain/first-tick.js";
import { EngineAllowlist } from "../ports/engine-allowlist.js";
import { parseDraft } from "./parse-draft.js";

/** @param {unknown} input */
export const performSimulateRegister = (input) =>
  Effect.gen(function* () {
    const draft = yield* parseDraft(input);
    const allowlist = yield* EngineAllowlist;
    const mint = widenedMint(draft.bounds.allowedMints, allowlist.mints);
    if (mint !== undefined) return yield* allowlistRefusal(mint, allowlist.mints);
    const price = yield* observed(draft);
    return { price, actions: firstTickActions(draft, price?.priceUsd) };
  }).pipe(Effect.withSpan("strategy.simulateRegister"));

/** @param {import("@solos-sh/actions").StrategyDraft} draft */
const observed = (draft) => {
  if (draft.kind !== "trigger") return Effect.succeed(null);
  return getPrice({ mint: draft.params.observe.price });
};
