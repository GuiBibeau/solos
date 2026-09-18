// @ts-check

/** @typedef {(input: string, init?: RequestInit) => Promise<Response>} Fetch */

/**
 * @typedef {{
 *   readonly inputMint: string;
 *   readonly outputMint: string;
 *   readonly amount: string;
 *   readonly slippageBps: number;
 * }} SwapOrderParams
 */

/**
 * @typedef {{
 *   readonly baseUrl: string;
 *   readonly apiKey: string;
 *   readonly timeoutMs?: number;
 *   readonly fetchImpl?: Fetch;
 * }} JupiterSwapConfig
 */

/** Outcome of one call, still untranslated: status plus the raw body text. */
/** @typedef {{ readonly status: number; readonly body: string }} JupiterSwapOutcome */

export const SWAP_V2_ORDER_PATH = "/swap/v2/order";
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Hops beyond this bound are a redirect loop and fail instead of being followed. */
export const MAX_REDIRECTS = 5;

/**
 * Quote-only requests are pinned to Jupiter's Metis router by excluding the other documented
 * routers. This matches the self-managed V2 build execution path (#18): a quote must never come
 * from a router that path cannot rebuild.
 */
export const EXCLUDED_ROUTERS = "jupiterz,dflow,okx";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Same loopback set the env-level base-url rule accepts for plain http. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

/**
 * Endpoint policy, identical to the base-url rule applied at startup: https everywhere, plain
 * http only for loopback test-fixture hosts. Every hop is re-checked before anything — including
 * the x-api-key header — is sent to it.
 * @param {URL} url
 */
const isAllowedDestination = (url) =>
  url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));

/**
 * Resolve one redirect hop against the current URL. Missing or unparseable locations fail with
 * fixed messages that never echo the URL; the resolved destination is validated by the caller
 * before the next request.
 * @param {URL} current
 * @param {Response} response
 * @returns {URL}
 */
const redirectTarget = (current, response) => {
  const location = response.headers.get("location");
  if (!location) throw new Error("Jupiter redirect had no location header");
  try {
    return new URL(location, current);
  } catch {
    throw new Error("Jupiter redirect location was not a valid URL");
  }
};

/**
 * GET one hop. `redirect: "manual"` keeps fetch from following anywhere on its own; the key is
 * attached only after the caller has validated the destination.
 * @param {{ fetchImpl: Fetch; apiKey: string; signal: AbortSignal }} transport
 * @param {URL} url
 */
const fetchHop = ({ fetchImpl, apiKey, signal }, url) =>
  fetchImpl(url.href, {
    headers: { "x-api-key": apiKey },
    redirect: "manual",
    signal,
  });

/**
 * The documented quote-only order query: required params, an explicit swapMode, a slippageBps
 * (the provider applies its own estimator when the param is absent, which would make the echoed
 * threshold unvalidatable), and the fixed Metis-only router exclusion. `taker` is never sent —
 * omitting it is the documented quote-only mode, so the response's transaction is null and no
 * executable artifact ever reaches solOS.
 * @param {URL} url
 * @param {SwapOrderParams} params
 */
const orderUrl = (url, params) => {
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount);
  url.searchParams.set("slippageBps", String(params.slippageBps));
  url.searchParams.set("swapMode", "ExactIn");
  url.searchParams.set("excludeRouters", EXCLUDED_ROUTERS);
  return url;
};

/**
 * One quote-only GET to the Jupiter Swap V2 order endpoint, following redirects hop by hop.
 * Single attempt, no retries — a quote is indicative and stale the moment it lands. Because
 * fetch follows redirects by default, each hop's destination must pass the endpoint policy
 * before it is contacted: a permitted endpoint or loopback fixture cannot bounce the request,
 * and its key, onto an unvalidated host, and a chain past the hop bound is a loop that fails.
 * One deadline, created here before the first hop, covers every hop and the body read. Failures
 * are fixed-message errors and are translated upstream.
 * @param {JupiterSwapConfig} config
 * @param {SwapOrderParams} params
 * @returns {Promise<JupiterSwapOutcome>}
 */
export const jupiterSwapOrder = async (
  { baseUrl, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch },
  params,
) => {
  const signal = AbortSignal.timeout(timeoutMs);
  let destination = orderUrl(new URL(SWAP_V2_ORDER_PATH, baseUrl), params);
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    if (!isAllowedDestination(destination)) {
      throw new Error("Jupiter swap destination was not an allowed endpoint");
    }
    const response = await fetchHop({ fetchImpl, apiKey, signal }, destination);
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { status: response.status, body: await response.text() };
    }
    destination = redirectTarget(destination, response);
  }
  throw new Error("Jupiter exceeded the redirect hop limit");
};
