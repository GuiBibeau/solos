// @ts-check
/**
 * Recording JSON-RPC proxy in front of a Surfnet RPC for integration tests: every request body
 * is forwarded untouched and every call is recorded, so a test can decode the exact wire bytes
 * the executor simulated or submitted — the chain sees what solOS built, byte for byte.
 */

/** @typedef {{ method: string; params: Array<unknown>; result?: unknown; error?: unknown }} RecordedCall */

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
    const payload = /** @type {{ result?: unknown; error?: unknown }} */ (JSON.parse(body));
    const call = calls.at(-1);
    if (call && !Array.isArray(payload)) {
      call.result = payload.result;
      if (payload.error !== undefined) call.error = payload.error;
    }
  } catch {
    // The original response is returned untouched even when it is not JSON.
  }
};

/** @typedef {Record<string, (params: unknown[]) => Promise<unknown> | unknown>} Overrides */
/** @param {string} body @returns {{id: unknown; method: string; params?: unknown[]} | null} */
const rpcMessage = (body) => {
  try {
    const value = JSON.parse(body);
    return typeof value?.method === "string" ? value : null;
  } catch {
    return null;
  }
};
/** @param {string} targetUrl @param {RecordedCall[]} calls @param {Overrides} overrides */
const proxyRequest = (targetUrl, calls, overrides) => async (/** @type {Request} */ request) => {
  const body = await request.text();
  recordRequests(body, calls);
  const message = rpcMessage(body);
  const handler = message && overrides[message.method];
  if (handler && message) {
    const result = await handler(message.params ?? []);
    const responseBody = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
    recordResult(responseBody, calls);
    return new Response(responseBody, { headers: { "content-type": "application/json" } });
  }
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
 * @param {Overrides} [overrides] Optional simulated program responses; every other RPC call still hits Surfpool.
 */
export const startRpcRecorder = (targetUrl, overrides = {}) => {
  /** @type {RecordedCall[]} */
  const calls = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: proxyRequest(targetUrl, calls, overrides),
  });
  /** @param {string} method @returns {RecordedCall[]} */
  const callsFor = (method) => calls.filter((call) => call.method === method);
  return { calls, callsFor, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};
