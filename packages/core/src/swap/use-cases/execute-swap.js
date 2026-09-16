// @ts-check
import { Clock, Effect } from "effect";
import { makeEvent } from "../../shared/domain/event.js";
import { EventBus } from "../../shared/ports/event-bus.js";
import { QuoteExpired } from "../domain/errors.js";
import { SwapProvider } from "../ports/swap-provider.js";

/**
 * Execute a previously fetched quote. Expiry is checked here so every entry point gets it.
 * @param {import("../domain/types.js").SwapQuote} quote
 * @param {{ skipSimulation: boolean }} options
 */
export const executeSwap = (quote, options) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    if (quote.expiresAt <= now) {
      return yield* new QuoteExpired({ expiresAt: quote.expiresAt, now });
    }
    const receipt = yield* (yield* SwapProvider).execute(quote, options);
    yield* (yield* EventBus).publish(makeEvent("swap.executed", receipt));
    return receipt;
  }).pipe(Effect.withSpan("swap.executeSwap"));
