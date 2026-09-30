// @ts-check
/**
 * One HTTP exchange with a fixed provider endpoint, following redirects hop by hop and only
 * while they stay on the origin the request started from (ADR-0033). `fetch` on its own would
 * carry the credential header to any Location: another origin, cleartext, or loopback. Every
 * hop is checked before anything, the key included, is sent to it; a redirected POST is refused
 * outright since no provider here redirects one legitimately. The body is read under a byte cap
 * so a hostile or broken endpoint cannot hold the process on an unbounded response. Failures
 * are fixed sentences that never echo a URL or a body.
 */

/** @typedef {(input: string, init?: RequestInit) => Promise<Response>} Fetch */
/**
 * @typedef {{
 *   readonly label: string;
 *   readonly headers: Record<string, string>;
 *   readonly signal: AbortSignal;
 *   readonly method?: "GET" | "POST";
 *   readonly body?: string;
 *   readonly fetchImpl?: Fetch;
 *   readonly maxBytes?: number;
 * }} PinnedRequest
 * @typedef {{ readonly status: number; readonly ok: boolean; readonly body: string; readonly headers: Headers }} PinnedOutcome
 */

/** Hops beyond this bound are a redirect loop and fail instead of being followed. */
export const MAX_REDIRECTS = 5;
/** Provider bodies here are small JSON documents; anything near this is not one of them. */
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Same loopback set the env-level base-url rule accepts for plain http. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

/** https everywhere, plain http only for loopback test-fixture hosts. @param {URL} url */
const isAllowedScheme = (url) =>
  url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));

/** @param {URL} current @param {Response} response @param {string} label @returns {URL} */
const redirectTarget = (current, response, label) => {
  const location = response.headers.get("location");
  if (!location) throw new Error(`${label} redirect had no location header`);
  try {
    return new URL(location, current);
  } catch {
    throw new Error(`${label} redirect location was not a valid URL`);
  }
};

/**
 * Read the body without trusting Content-Length, cancelling the stream at the cap.
 * @param {Response} response @param {number} maxBytes @param {string} label
 */
const boundedText = async (response, maxBytes, label) => {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const part = await reader.read();
    if (part.done) return text + decoder.decode();
    bytes += part.value.byteLength;
    if (bytes > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new Error(`${label} response exceeded the size limit`);
    }
    text += decoder.decode(part.value, { stream: true });
  }
};

/**
 * One hop: the destination must still be on the start origin and an allowed scheme before the
 * headers leave the process.
 * @param {PinnedRequest} request @param {URL} destination @param {string} origin
 */
const hop = (request, destination, origin) => {
  const { label, fetchImpl = fetch, method = "GET" } = request;
  if (!isAllowedScheme(destination)) throw new Error(`${label} destination was not allowed`);
  if (destination.origin !== origin) throw new Error(`${label} redirect crossed origins`);
  return fetchImpl(destination.href, {
    method,
    headers: request.headers,
    body: request.body,
    redirect: "manual",
    signal: request.signal,
  });
};

/**
 * @param {PinnedRequest} request
 * @param {URL} start
 * @returns {Promise<PinnedOutcome>}
 */
export const pinnedFetch = async (request, start) => {
  const { label, method = "GET", maxBytes = MAX_RESPONSE_BYTES } = request;
  let destination = start;
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    const response = await hop(request, destination, start.origin);
    if (!REDIRECT_STATUSES.has(response.status)) {
      const body = await boundedText(response, maxBytes, label);
      return { status: response.status, ok: response.ok, body, headers: response.headers };
    }
    if (method !== "GET") throw new Error(`${label} redirected a POST; refused`);
    destination = redirectTarget(destination, response, label);
  }
  throw new Error(`${label} exceeded the redirect hop limit`);
};
