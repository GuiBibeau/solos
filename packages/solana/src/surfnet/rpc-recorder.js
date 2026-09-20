// @ts-check
/**
 * Recording JSON-RPC proxy in front of a Surfnet RPC for integration tests: every request body
 * is forwarded untouched and every call is recorded, so a test can decode the exact wire bytes
 * the executor simulated or submitted — the chain sees what solOS built, byte for byte.
 */

/** @typedef {{ method: string; params: Array<unknown> }} RecordedCall */

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
    async fetch(request) {
      const body = await request.text();
      try {
        const payload = /** @type {unknown} */ (JSON.parse(body));
        const entries = Array.isArray(payload) ? payload : [payload];
        for (const entry of entries) {
          const candidate = /** @type {{ method?: unknown; params?: unknown }} */ (entry);
          if (typeof candidate?.method === "string") {
            calls.push({
              method: candidate.method,
              params: /** @type {Array<unknown>} */ (candidate.params ?? []),
            });
          }
        }
      } catch {
        // Non-JSON bodies are forwarded untouched; the upstream answers the protocol error.
      }
      const upstream = await fetch(targetUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "application/json",
        },
      });
    },
  });
  /** @param {string} method @returns {RecordedCall[]} */
  const callsFor = (method) => calls.filter((call) => call.method === method);
  return { calls, callsFor, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};
