// @ts-check
import { Effect, Layer } from "effect";
import { nextInstant } from "../domain/cadence.js";
import { TickSource } from "../ports/tick-source.js";

/** Clock adapter. The instant comes from the caller, so tests drive time without sleeping. */
export const clockTickSource = Layer.sync(TickSource, () => ({
  nextDue: (strategy, now) => Effect.sync(() => nextInstant(strategy, now)),
}));
