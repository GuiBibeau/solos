// @ts-check

/** @typedef {(input: string, init?: RequestInit) => Promise<Response>} Fetch */

/**
 * @typedef {{
 *   readonly baseUrl: string;
 *   readonly timeoutMs?: number;
 *   readonly confirmDeadlineMs?: number;
 *   readonly fetchImpl?: Fetch;
 * }} PhoenixConfig
 */

/** Outcome of one call, still untranslated: status plus the raw body text. */
/** @typedef {{ readonly status: number; readonly body: string }} PhoenixOutcome */

export const MARKET_PATH = "/v1/view/exchange/market";
export const MARKETS_PATH = "/v1/view/exchange/markets";
export const TRADER_STATE_PATH = "/v1/trader/state";
/** Public funding history. The symbol is the wire ticker (`SOL`), and the suffix is `/rates`. */
export const FUNDING_RATES_PATH = "/v1/funding";
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Pins for ADR-0021 / issue #26: the production Phoenix Perps program, verified inside
 * Ellipsis Labs' official Rise source at this exact revision, plus the pinned SDK manifest
 * version of that revision. Any replacement revision must be verified separately before this
 * constant changes. The read path is the documented wire contract of that revision
 * (`traderPdaIndex=0`, quote lots at 1e-6 USDC, market params carrying `baseLotsDecimals`).
 */
export const RISE_REVISION = "4bd3c505f16f09fdbe9fb2eff035aeaef8b7b12d";
export const RISE_SDK_VERSION = "0.5.26";
export const PHOENIX_PERPS_PROGRAM = "EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih";

/**
 * Funding read pinned beside `RISE_SDK_VERSION` (issue #202). The client stays on that Rise
 * revision; these fields were read from the production host `https://perp-api.phoenix.trade`
 * with no bearer token. The OpenAPI security block lists a bearer scheme; the host answers
 * the two GETs below without one.
 *
 * Schedule, from `GET /v1/view/exchange/market/{symbol}` — the market view the open path
 * already parses for `tickSize`, `baseLotsDecimals` and `marketStatus`:
 * - `fundingIntervalSeconds` — interval length. SOL is 3600. Required to scale a print into
 *   an hourly percent (`hourly = intervalPct * 3600 / fundingIntervalSeconds`).
 * - `fundingPeriodSeconds` — funding period. SOL is 86400. Not used in the hourly/APR scale.
 * - `statsSnapshot.fundingStartIntervalTimestamp` — unix seconds when the current interval
 *   started. `nextFundingAt` is that instant plus `fundingIntervalSeconds`. Null when the
 *   snapshot is absent.
 * - `statsSnapshot.cumulativeFundingRate` — quote accumulator, not a percentage. Ignored.
 *
 * Prints, from `GET /v1/funding/{symbol}/rates?startTime&endTime&limit`. `startTime` and
 * `endTime` are unix milliseconds; `limit` caps points (max 10000). `{symbol}` is the wire
 * ticker (`SOL`); `SOL-PERP` 404s.
 * - `symbol` — wire ticker, echoed and checked.
 * - `rates[].timestamp` — unix seconds on the live host. An ISO-8601 string is also accepted.
 * - `rates[].fundingRatePercentage` — signed percent of notional for that interval. Positive
 *   means longs pay shorts (Phoenix: mark above index).
 * The newest in-window point is the current rate. Every in-window point is `history`, oldest
 * first, each scaled to an hourly percent. APR is that hourly percent times 24 * 365.
 *
 * When `rates` is empty, optional siblings `fundingRatePercentage` and `timestamp` are the
 * current interval and the snapshot's `history` is `[]`. The production host fills `rates`.
 * A known market with neither a point nor those siblings is `PerpStateIncomplete`. A 404 on
 * the rates route after the market view succeeded is the same empty series, not an unknown
 * market.
 */

/** The contract's account scope: one request shape for every read. */
export const TRADER_PDA_INDEX = 0;

/**
 * One public GET to the Phoenix Perps API. Reads carry no credential and no client-identity
 * header — nothing that could leak config. Single attempt, no retries, and the abort deadline
 * covers the whole call including body consumption.
 * @param {PhoenixConfig} config
 * @param {string} path
 * @param {Record<string, string>} [query]
 * @returns {Promise<PhoenixOutcome>}
 */
export const phoenixGet = async (
  { baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch },
  path,
  query = {},
) => {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status, body: await response.text() };
};

/**
 * True only for deadline aborts (`AbortSignal.timeout`), never for caller cancellation.
 * @param {unknown} error
 */
export const isDeadlineAbort = (error) => {
  const name = /** @type {{ name?: unknown }} */ (error)?.name;
  return name === "TimeoutError" || name === "AbortError";
};
