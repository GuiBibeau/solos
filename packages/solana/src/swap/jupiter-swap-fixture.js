// @ts-check
import { getQuote } from "@solos/core";
import { Cause, Effect, Exit, Option } from "effect";
import { JupiterSwapLive } from "./jupiter-swap-live.js";

/**
 * Offline loopback fixture for the Jupiter Swap V2 quote-only endpoint.
 *
 * Provenance. Endpoint contract: `GET {base}/swap/v2/order` (developers.jup.ag, Swap API V2 —
 * "Order & Execute" and the swap.yaml OpenAPI spec), rechecked 2026-09-18. Live probes on
 * api.jup.ag in 2026-08: a taker-less request returned 200 with `transaction: null`,
 * `taker: null`, `mode: "ultra"`, `router: "metis"`, `priceImpact` a JSON number in percentage
 * points (deprecated `priceImpactPct` string exactly `priceImpact / 100`), and the undocumented
 * extras `guaranteedPrice` and `jitOptimized` (both boolean). All routers excluded returns
 * 400 `{"requestId": "...", "error": "Failed to get quotes"}`. The canned bodies below carry
 * only fields the provider documents or was observed to return — never a fabricated zero for a
 * missing field.
 *
 * Response-field/unit mapping exercised by these bodies:
 * - `inAmount`/`outAmount`/`otherAmountThreshold`: exact decimal strings in base units.
 * - `priceImpact`: percentage points JSON number -> `priceImpactPct` = `priceImpact / 100`.
 * - `routeSummary`: `routePlan[].swapInfo.label` hop labels (V2 has no routeSummary object).
 * - `expiresAt`: local receipt time + 30_000 ms local TTL (not a provider guarantee).
 */

export const KEY = "test-jupiter-key";
/** wSOL and USDC: well-known public mints, used as the fixture pair. */
export const INPUT_MINT = "So11111111111111111111111111111111111111112";
export const OUTPUT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** 31 digits: base units must never pass through a JS Number on the way in or out. */
export const AMOUNT = "1000000000000000000000000000000";
export const OUT_AMOUNT = "169900000000000000000000000000";
/** Exact worst case at the 50 bps default tolerance: floor(OUT_AMOUNT * 9950 / 10000), BigInt. */
export const MIN_OUT_AMOUNT = "169050500000000000000000000000";
/** One percentage point: asserts the legacy divide-by-100 ratio convention ("0.01"). */
export const PRICE_IMPACT = 1;
export const BODY_MARKER = "SECRET-UPSTREAM-BODY-MARKER";
/** Live-observed Orca ammKey used by the canned route hop. */
export const OK_AMM_KEY = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";

/** Documented success body the fixture serves by default: quote-only, Metis-routed. */
export const okBody = (overrides = {}) => ({
  mode: "manual",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  inAmount: AMOUNT,
  outAmount: OUT_AMOUNT,
  otherAmountThreshold: MIN_OUT_AMOUNT,
  priceImpact: PRICE_IMPACT,
  priceImpactPct: String(PRICE_IMPACT / 100),
  swapMode: "ExactIn",
  slippageBps: 50,
  router: "metis",
  swapType: "aggregator",
  routePlan: [
    {
      swapInfo: {
        ammKey: OK_AMM_KEY,
        label: "Orca",
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        inAmount: AMOUNT,
        outAmount: OUT_AMOUNT,
      },
      percent: 100,
      bps: 10_000,
    },
  ],
  transaction: null,
  taker: null,
  guaranteedPrice: false,
  jitOptimized: false,
  ...overrides,
});

/**
 * @typedef {Array<{ status?: number; body?: unknown; location?: string }>} FixtureResponses
 * @typedef {{ url: string; method: string; key: string | undefined; inputMint: string | null; outputMint: string | null; amount: string | null; slippageBps: string | null; swapMode: string | null; excludeRouters: string | null; taker: string | null }} RecordedRequest
 */

/**
 * Recording loopback fixture: records every request, answers by shifting the response queue.
 * Never contacts the real Jupiter endpoint.
 * @param {FixtureResponses} responses
 * @param {{ delayMs?: number; bodyDelayMs?: number }} [options]
 */
export const startFixture = (responses, { delayMs = 0, bodyDelayMs = 0 } = {}) => {
  /** @type {RecordedRequest[]} */
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const params = new URL(request.url).searchParams;
      requests.push({
        url: request.url,
        method: request.method,
        key: request.headers.get("x-api-key") ?? undefined,
        inputMint: params.get("inputMint"),
        outputMint: params.get("outputMint"),
        amount: params.get("amount"),
        slippageBps: params.get("slippageBps"),
        swapMode: params.get("swapMode"),
        excludeRouters: params.get("excludeRouters"),
        taker: params.get("taker"),
      });
      const next = responses.shift() ?? { status: 500, body: BODY_MARKER };
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const payload = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
      const headers = /** @type {Record<string, string>} */ ({
        "content-type": "application/json",
      });
      if (next.location) headers.location = next.location;
      return new Response(delayedBody(payload, bodyDelayMs), {
        status: next.status ?? 200,
        headers,
      });
    },
  });
  return { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** @param {string} payload @param {number} delayMs */
const delayedBody = (payload, delayMs) => {
  if (delayMs === 0) return payload;
  return new ReadableStream({
    async start(controller) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      } catch {
        // The client deadline can cancel the stream before the fixture writes its body.
      }
    },
  });
};

/** Canonical quote request for the fixture pair, at the documented default slippage. */
export const quoteRequest = () => ({
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: AMOUNT,
  slippageBps: 50,
});

/**
 * Run the real use case against the fixture-backed live adapter and await the quote.
 * @param {ReturnType<typeof startFixture>} fixture
 * @param {Partial<{ apiKey: string; timeoutMs: number; fetchImpl: import("./jupiter-swap-api.js").Fetch }>} [overrides]
 * @param {import("@solos/core").SwapQuoteRequest} [request]
 */
export const quoteThrough = (fixture, overrides = {}, request = quoteRequest()) =>
  Effect.runPromise(
    getQuote(request).pipe(Effect.provide(JupiterSwapLive(toConfig(fixture, overrides)))),
  );

/**
 * Run a quote read and hand back the tagged failure, or undefined when it unexpectedly succeeded.
 * @param {ReturnType<typeof startFixture>} fixture
 * @param {Partial<{ apiKey: string; timeoutMs: number; fetchImpl: import("./jupiter-swap-api.js").Fetch }>} [overrides]
 * @param {import("@solos/core").SwapQuoteRequest} [request]
 */
export const quoteFailure = async (fixture, overrides = {}, request = quoteRequest()) => {
  const exit = await Effect.runPromiseExit(
    getQuote(request).pipe(Effect.provide(JupiterSwapLive(toConfig(fixture, overrides)))),
  );
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) ? failure.value : undefined;
};

/** @param {ReturnType<typeof startFixture>} fixture @param {Partial<{ apiKey: string; timeoutMs: number; fetchImpl: import("./jupiter-swap-api.js").Fetch }>} overrides */
const toConfig = (fixture, overrides) => ({
  baseUrl: fixture.url,
  apiKey: "apiKey" in overrides ? overrides.apiKey : KEY,
  timeoutMs: overrides.timeoutMs,
  fetchImpl: overrides.fetchImpl,
});
