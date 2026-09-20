// @ts-check
/**
 * Recording JSON-RPC proxy in front of a Surfnet RPC for integration tests: every request body
 * is forwarded untouched and every call is recorded, so a test can decode the exact wire bytes
 * the executor simulated or submitted — the chain sees what solOS built, byte for byte.
 */

/** @typedef {{ method: string; params: Array<unknown>; result?: unknown }} RecordedCall */

/** @param {string} body @param {RecordedCall[]} calls */
const recordRequests = (body, calls) => {
  try {
    const payload = /** @type {unknown} */ (JSON.parse(body));
    const entries = Array.isArray(payload) ? payload : [payload];
    for (const entry of entries) {
      const candidate = /** @type {{ method?: unknown; params?: unknown }} */ (entry);
      if (typeof candidate?.method !== "string") continue;
      calls.push({
        method: candidate.method,
        params: /** @type {Array<unknown>} */ (candidate.params ?? []),
      });
    }
  } catch {
    // Non-JSON bodies are forwarded untouched; the upstream answers the protocol error.
  }
};

/** @param {string} body @param {RecordedCall[]} calls */
const recordResult = (body, calls) => {
  try {
    const payload = /** @type {{ result?: unknown }} */ (JSON.parse(body));
    const call = calls.at(-1);
    if (call && !Array.isArray(payload)) call.result = payload.result;
  } catch {
    // The original response is returned untouched even when it is not JSON.
  }
};

/** @param {string} targetUrl @param {RecordedCall[]} calls */
const proxyRequest = (targetUrl, calls) => async (/** @type {Request} */ request) => {
  const body = await request.text();
  recordRequests(body, calls);
  const upstream = await fetch(targetUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const responseBody = await upstream.text();
  recordResult(responseBody, calls);
  return new Response(responseBody, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
};

/**
 * Start the recording proxy on a loopback port, forwarding to the given RPC URL.
 * @param {string} targetUrl
 */
export const startRpcRecorder = (targetUrl) => {
  /** @type {RecordedCall[]} */
  const calls = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: proxyRequest(targetUrl, calls),
  });
  /** @param {string} method @returns {RecordedCall[]} */
  const callsFor = (method) => calls.filter((call) => call.method === method);
  return { calls, callsFor, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};
