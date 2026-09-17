// @ts-check

/** @typedef {(input: string, init?: RequestInit) => Promise<Response>} Fetch */

/**
 * @typedef {{
 *   readonly baseUrl: string;
 *   readonly apiKey: string;
 *   readonly timeoutMs?: number;
 *   readonly fetchImpl?: Fetch;
 * }} JupiterPriceConfig
 */

/** Outcome of one call, still untranslated: status plus the raw body text. */
/** @typedef {{ readonly status: number; readonly body: string }} JupiterPriceOutcome */

export const PRICE_V3_PATH = "/price/v3";
export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * One GET to the Jupiter Price V3 endpoint. Single attempt, no retries — the feed is served
 * through a CDN and a silent retry would only widen staleness. The abort deadline covers the
 * whole call including body consumption.
 * @param {JupiterPriceConfig} config
 * @param {string} mint
 * @returns {Promise<JupiterPriceOutcome>}
 */
export const jupiterPrice = async (
  { baseUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch },
  mint,
) => {
  const url = new URL(PRICE_V3_PATH, baseUrl);
  url.searchParams.set("ids", mint);
  const response = await fetchImpl(url.href, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, body: await response.text() };
};
