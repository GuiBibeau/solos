// @ts-check

/** @typedef {(input: string, init?: RequestInit) => Promise<Response>} Fetch */

/**
 * @typedef {{
 *   readonly baseUrl: string;
 *   readonly timeoutMs?: number;
 *   readonly fetchImpl?: Fetch;
 * }} PhoenixConfig
 */

/** Outcome of one call, still untranslated: status plus the raw body text. */
/** @typedef {{ readonly status: number; readonly body: string }} PhoenixOutcome */

export const MARKET_PATH = "/v1/view/exchange/market";
export const MARKETS_PATH = "/v1/view/exchange/markets";
export const TRADER_STATE_PATH = "/v1/trader/state";
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
