// @ts-check
/**
 * Test fixture: an offline loopback Vercel AI Gateway that speaks the evaluation-model protocol.
 * It records every request and answers by shifting the queue. It never contacts the real gateway.
 * The default answer is shaped like a live JEV response captured on 2026-09-28.
 */

export const KEY = "test-gateway-key";
/** Text a provider error body carries; it must never reach a selection. */
export const BODY_MARKER = "SECRET-UPSTREAM-BODY-MARKER";

/**
 * JEV's answer to the one choice question, as the gateway returns it.
 * @param {Record<string, number>} probabilities
 */
export const jevAnswer = (probabilities) => {
  const [choice = ""] = Object.entries(probabilities).toSorted(([, a], [, b]) => b - a)[0] ?? [];
  return {
    answers: { tool: { type: "choice", choice, probabilities } },
    model: "typesafe-ai/jev",
    rounding: { probabilityDecimals: 2, scoreDecimals: 2 },
    usage: { inputTokens: 1356, outputTokens: 665 },
    warnings: [],
    providerMetadata: { typesafe: { confidence: { tool: 0.93 } } },
  };
};

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {Array<{ status?: number; body?: unknown; delayMs?: number }>} responses
 */
export const startGateway = (responses) => {
  /** @type {Array<{ path: string; modelId: string | null; authorization: string | null; body: any }>} */
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push({
        path: new URL(request.url).pathname,
        modelId: request.headers.get("ai-model-id"),
        authorization: request.headers.get("authorization"),
        body: await request.json(),
      });
      const next = responses.shift() ?? { status: 500, body: { error: { message: BODY_MARKER } } };
      if (next.delayMs) await sleep(next.delayMs);
      return Response.json(next.body, { status: next.status ?? 200 });
    },
  });
  return {
    requests,
    baseUrl: `http://127.0.0.1:${server.port}/v4/ai`,
    stop: () => server.stop(true),
  };
};
