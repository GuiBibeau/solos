// @ts-check
import { pinnedFetch } from "../http/pinned-fetch.js";

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

export { MAX_REDIRECTS } from "../http/pinned-fetch.js";

/**
 * One priced GET to the Jupiter Price V3 endpoint. Single attempt, no retries — the feed is
 * served through a CDN and a silent retry would only widen staleness. Redirects are followed hop
 * by hop only while they stay on the configured origin, so the key never leaves it (ADR-0033);
 * the body is read under a byte cap. One deadline, created here before the first hop, covers
 * every hop and the body read. Failures are fixed-message errors and are translated upstream.
 * @param {JupiterPriceConfig} config
 * @param {string} mint
 * @returns {Promise<JupiterPriceOutcome>}
 */
export const jupiterPrice = async (
  { baseUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch },
  mint,
) => {
  const start = new URL(PRICE_V3_PATH, baseUrl);
  start.searchParams.set("ids", mint);
  const { status, body } = await pinnedFetch(
    {
      label: "Jupiter price",
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      fetchImpl,
    },
    start,
  );
  return { status, body };
};
