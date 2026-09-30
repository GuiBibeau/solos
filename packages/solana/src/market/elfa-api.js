// @ts-check
import { pinnedFetch } from "../http/pinned-fetch.js";

/** @typedef {(input: string, init?: RequestInit) => Promise<Response>} Fetch */

/**
 * @typedef {{
 *   readonly baseUrl: string;
 *   readonly apiKey: string;
 *   readonly timeoutMs?: number;
 *   readonly fetchImpl?: Fetch;
 * }} ElfaChatConfig
 */

/** Outcome of one call, still untranslated: status plus the raw body text. */
/** @typedef {{ readonly status: number; readonly ok: boolean; readonly body: string }} ElfaChatOutcome */

export const CHAT_PATH = "/v2/chat";
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * One POST to the Elfa chat endpoint. Single attempt, no retries — Iris calls bill credits
 * per request, so a silent retry would double-bill. The abort deadline covers the whole call
 * including body consumption.
 * @param {ElfaChatConfig} config
 * @param {string} message
 * @returns {Promise<ElfaChatOutcome>}
 */
export const elfaChat = async (
  { baseUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch },
  message,
) => {
  // A redirected POST is refused and the body is capped, so the key stays on this origin
  // (ADR-0033).
  const response = await pinnedFetch(
    {
      label: "Elfa chat",
      method: "POST",
      headers: { "content-type": "application/json", "x-elfa-api-key": apiKey },
      body: JSON.stringify({ analysisType: "chat", message, speed: "fast" }),
      signal: AbortSignal.timeout(timeoutMs),
      fetchImpl,
    },
    new URL(`${baseUrl}${CHAT_PATH}`),
  );
  return { status: response.status, ok: response.ok, body: response.body };
};

/**
 * True only for deadline aborts (`AbortSignal.timeout`), never for caller cancellation.
 * @param {unknown} error
 */
export const isDeadlineAbort = (error) => {
  const name = /** @type {{ name?: unknown }} */ (error)?.name;
  return name === "TimeoutError" || name === "AbortError";
};
