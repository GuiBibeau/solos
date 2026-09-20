// @ts-check
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";

/**
 * Loopback HTTP fixture for `GET /swap/v2/build`, for end-to-end tests that run the real
 * JupiterSwapBuildLive transport: it records every request and answers with the documented
 * envelope for the requested taker. Overrides mutate one field at a time (an expired lifetime,
 * for example); a custom responder replaces the body wholesale. Never contacts the real
 * Jupiter endpoint.
 */

/**
 * @typedef {{
 *   url: string;
 *   method: string;
 *   key: string | undefined;
 *   taker: string | null;
 *   amount: string | null;
 *   inputMint: string | null;
 *   outputMint: string | null;
 *   slippageBps: string | null;
 *   payer: string | null;
 *   tipAmount: string | null;
 * }} RecordedBuildRequest
 */

/**
 * Start the recording build fixture on a loopback port.
 * @param {{
 *   overrides?: Record<string, unknown>;
 *   responder?: (params: URLSearchParams) => Promise<unknown> | undefined;
 * }} [options]
 */
export const startBuildFixture = ({ overrides = {}, responder } = {}) => {
  /** @type {RecordedBuildRequest[]} */
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const params = new URL(request.url).searchParams;
      requests.push({
        url: request.url,
        method: request.method,
        key: request.headers.get("x-api-key") ?? undefined,
        taker: params.get("taker"),
        amount: params.get("amount"),
        inputMint: params.get("inputMint"),
        outputMint: params.get("outputMint"),
        slippageBps: params.get("slippageBps"),
        payer: params.get("payer"),
        tipAmount: params.get("tipAmount"),
      });
      const custom = responder?.(params);
      if (custom !== undefined) return Response.json(await custom);
      const taker = params.get("taker") ?? "";
      return Response.json(await buildEnvelope({ taker, overrides }));
    },
  });
  return { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};
