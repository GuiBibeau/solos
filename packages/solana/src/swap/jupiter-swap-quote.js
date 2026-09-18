// @ts-check
import {
  NoRouteFound,
  QuoteAuthFailed,
  QuoteHttpError,
  QuoteNetworkError,
  QuoteRateLimited,
  QuoteResponseInvalid,
  QuoteTimeout,
} from "@solos/core";
import { Effect } from "effect";
import { z } from "zod";
import { isDeadlineAbort } from "../market/elfa-api.js";
import { DEFAULT_TIMEOUT_MS, jupiterSwapOrder } from "./jupiter-swap-api.js";
import { envelopeRejection, routeRejection } from "./jupiter-swap-validate.js";

/**
 * Normalization of the Jupiter Swap V2 quote-only response (`GET /swap/v2/order`, no `taker`)
 * onto the slice's `SwapQuote`.
 *
 * Units: `inAmount`, `outAmount`, and `otherAmountThreshold` are exact decimal strings in base
 * units and travel verbatim — never through a JS Number; consistency bounds are checked with
 * BigInt (see jupiter-swap-validate.js). `priceImpact` is a JSON number in percentage points;
 * `priceImpactPct` keeps the slice's legacy decimal-ratio convention by dividing by 100
 * (1 percentage point => "0.01"), shortest-round-trip Number math on a ratio, never on a
 * base-unit amount — same documented rationale as the Jupiter price adapter. V2 has no
 * `routeSummary` object; hop labels are `routePlan[].swapInfo.label`.
 *
 * Freshness: V2 documents no quote TTL, so `expiresAt` is the local receipt time plus a
 * 30-second local TTL — when solOS stops presenting the quote as usable, not a price guarantee.
 */

/** Local quote lifetime; deliberately short because quotes go stale well under a minute. */
export const QUOTE_TTL_MS = 30_000;

/** The one documented no-route 400 message; no structural proxy exists on a 400. */
const NO_ROUTE_MESSAGE = "Failed to get quotes";

const PROVIDER = /** @type {const} */ ("jupiter");

/** Documented routing step: the hop identity, its base-unit amounts, and its allocation. */
const RouteStepSchema = z.object({
  swapInfo: z
    .object({
      ammKey: z.string().min(1),
      label: z.string().min(1),
      inputMint: z.string().min(1),
      outputMint: z.string().min(1),
      inAmount: z.string(),
      outAmount: z.string(),
    })
    .strip(),
  percent: z.number().min(1).max(100),
  bps: z.number().int().min(1).max(10_000),
});

/** Documented 200 envelope, parsed in strip mode so provider extensions never break us. */
const QuoteEnvelopeSchema = z.object({
  inputMint: z.string(),
  outputMint: z.string(),
  inAmount: z.string(),
  outAmount: z.string(),
  otherAmountThreshold: z.string().optional(),
  priceImpact: z.number().finite().optional(),
  swapMode: z.string(),
  slippageBps: z.number().int().min(0).max(10_000),
  router: z.string(),
  routePlan: z.array(RouteStepSchema.strip()),
  transaction: z.union([z.string(), z.null()]),
});

/** @typedef {z.infer<typeof QuoteEnvelopeSchema>} JupiterQuoteEnvelope */

/** @param {string} body @returns {unknown} */
const parseJson = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isJsonObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** @param {string} body */
const isNoRouteBody = (body) => {
  const parsed = parseJson(body);
  return isJsonObject(parsed) && parsed.error === NO_ROUTE_MESSAGE;
};

/**
 * Non-2xx status to the slice error, or undefined for 2xx. The documented no-route 400 body is
 * the only message the adapter matches; every other body stays redacted.
 * @param {import("./jupiter-swap-api.js").JupiterSwapOutcome} outcome
 * @param {import("@solos/core").SwapQuoteRequest} request
 * @returns {import("@solos/core").SwapQuoteError | undefined}
 */
const statusError = (outcome, request) => {
  if (outcome.status === 401 || outcome.status === 403)
    return new QuoteAuthFailed({ status: outcome.status });
  if (outcome.status === 429) return new QuoteRateLimited({ status: outcome.status });
  if (outcome.status < 200 || outcome.status >= 300) {
    if (outcome.status === 400 && isNoRouteBody(outcome.body)) {
      return new NoRouteFound({
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        provider: PROVIDER,
      });
    }
    return new QuoteHttpError({
      status: outcome.status,
      reason: `Jupiter answered with HTTP ${outcome.status}`,
    });
  }
  return undefined;
};

/** @param {number} status @param {string} reason */
const invalid = (status, reason) => new QuoteResponseInvalid({ status, reason });

/**
 * @param {JupiterQuoteEnvelope} quote
 * @param {import("@solos/core").SwapQuoteRequest} request
 * @returns {import("@solos/core").SwapQuote}
 */
const toSwapQuote = (quote, request) => ({
  provider: PROVIDER,
  inputMint: request.inputMint,
  outputMint: request.outputMint,
  inAmount: quote.inAmount,
  outAmount: quote.outAmount,
  // Presence is guaranteed by envelopeRejection before this runs.
  minOutAmount: /** @type {string} */ (quote.otherAmountThreshold),
  priceImpactPct: String(/** @type {number} */ (quote.priceImpact) / 100),
  routeSummary: quote.routePlan.map((step) => step.swapInfo.label),
  expiresAt: Date.now() + QUOTE_TTL_MS,
  raw: quote,
});

/**
 * Translate one outcome into a SwapQuote or a slice-owned error. Raw bodies and the API key
 * never become error props; only the HTTP status and a short fixed reason travel. An empty
 * route plan is the structural no-route case; a non-empty one must pass the route contract.
 * @param {import("./jupiter-swap-api.js").JupiterSwapOutcome} outcome
 * @param {import("@solos/core").SwapQuoteRequest} request
 */
const fromOutcome = (outcome, request) => {
  const failed = statusError(outcome, request);
  if (failed) return Effect.fail(failed);
  const parsed = parseJson(outcome.body);
  if (!isJsonObject(parsed))
    return Effect.fail(invalid(outcome.status, "response was not a JSON object"));
  const envelope = QuoteEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return Effect.fail(
      invalid(outcome.status, "response did not match the documented quote envelope"),
    );
  }
  const envelopeReason = envelopeRejection(envelope.data, request);
  if (envelopeReason) return Effect.fail(invalid(outcome.status, envelopeReason));
  if (envelope.data.routePlan.length === 0) {
    return Effect.fail(
      new NoRouteFound({
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        provider: PROVIDER,
      }),
    );
  }
  const routeReason = routeRejection(envelope.data);
  if (routeReason) return Effect.fail(invalid(outcome.status, routeReason));
  return Effect.succeed(toSwapQuote(envelope.data, request));
};

/**
 * One quote-only order fetch through the transport, translated to the slice error channel.
 * Single attempt: a deadline abort is a QuoteTimeout and any other transport failure a
 * QuoteNetworkError — neither is retried.
 * @param {import("@solos/core").SwapQuoteRequest} request
 * @param {import("./jupiter-swap-api.js").JupiterSwapConfig} config
 */
export const fetchQuote = (request, config) => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Effect.tryPromise({
    try: () => jupiterSwapOrder(config, request),
    catch: (error) =>
      isDeadlineAbort(error)
        ? new QuoteTimeout({ timeoutMs })
        : new QuoteNetworkError({ reason: "Jupiter swap quote request failed" }),
  }).pipe(Effect.flatMap((outcome) => fromOutcome(outcome, request)));
};
