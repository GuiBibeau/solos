// @ts-check
import { Effect, Layer } from "effect";
import { SpendMeter } from "../ports/spend-meter.js";

/**
 * A fixed reservation and measured spend. Tests use it so a quote never calls a price feed.
 * @param {import("../ports/spend-meter.js").SpendQuote | ((action: import("@solos-sh/actions").Action) => import("../ports/spend-meter.js").SpendQuote)} quote
 */
export const scriptedSpendMeter = (quote) =>
  Layer.sync(SpendMeter, () => ({
    quote: (action) => Effect.sync(() => (typeof quote === "function" ? quote(action) : quote)),
  }));
