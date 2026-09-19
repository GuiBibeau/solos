// @ts-check
import { MARKET_PATH, MARKETS_PATH, TRADER_STATE_PATH } from "./phoenix-api.js";
import { coldState, DEFAULT_MARKETS } from "./phoenix-scenarios.js";

const JSON_HEADERS = { "content-type": "application/json" };
export const SECRET_MARKER = "SECRET-UPSTREAM-BODY-MARKER";

/**
 * Per-test script: what the loopback Phoenix fixture serves. Bodies may be canned scenario
 * values, per-symbol maps, or functions of the requested authority; a raw body string stands
 * in for malformed or hostile upstream responses.
 * @typedef {{
 *   readonly markets?: unknown;
 *   readonly market?: Record<string, unknown>;
 *   readonly marketNotFound?: unknown;
 *   readonly marketStatus?: number;
 *   readonly trader?: unknown;
 *   readonly traderStatus?: number;
 *   readonly rawTraderBody?: string;
 * }} PhoenixScript
 */

/** @param {unknown} body @param {number} [status] */
const json = (body, status = 200) => Response.json(body, { status, headers: JSON_HEADERS });

/** @param {string} payload @param {number} status @param {number} delayMs */
const delayedBody = (payload, status, delayMs) => {
  if (delayMs === 0) return new Response(payload, { status, headers: JSON_HEADERS });
  return new Response(
    new ReadableStream({
      async start(controller) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
          controller.enqueue(new TextEncoder().encode(payload));
          controller.close();
        } catch {
          // The client deadline can cancel the stream before the fixture writes its body.
        }
      },
    }),
    { status, headers: JSON_HEADERS },
  );
};

/**
 * A symbol resolves from its per-symbol override first, then the markets list; everything
 * else is the documented 404 (or the script's not-found override).
 * @param {PhoenixScript} script @param {string} symbol
 */
const marketResponse = (script, symbol) => {
  const override = script.market?.[symbol];
  if (override !== undefined) return json(override);
  const listed = /** @type {Array<{ symbol: string }>} */ (script.markets ?? DEFAULT_MARKETS).find(
    (entry) => entry.symbol === symbol,
  );
  if (listed !== undefined) return json(listed);
  return json(
    script.marketNotFound ?? { error: `Market '${symbol}' not found` },
    script.marketStatus ?? 404,
  );
};

/** @param {PhoenixScript} script @param {string} authority @param {number} bodyDelayMs */
const traderResponse = (script, authority, bodyDelayMs) => {
  const status = script.traderStatus ?? 200;
  if (script.rawTraderBody !== undefined)
    return delayedBody(script.rawTraderBody, status, bodyDelayMs);
  const source = script.trader;
  const body =
    typeof source === "function"
      ? /** @type {(a: string) => unknown} */ (source)(authority)
      : source;
  return delayedBody(JSON.stringify(body ?? coldState(authority)), status, bodyDelayMs);
};

/** @param {PhoenixScript} script @param {URL} url @param {number} bodyDelayMs */
const respond = (script, url, bodyDelayMs) => {
  if (url.pathname === MARKETS_PATH) return json(script.markets ?? DEFAULT_MARKETS);
  if (url.pathname.startsWith(`${MARKET_PATH}/`)) {
    return marketResponse(script, decodeURIComponent(url.pathname.slice(MARKET_PATH.length + 1)));
  }
  if (url.pathname.startsWith(`${TRADER_STATE_PATH}/`)) {
    return traderResponse(
      script,
      decodeURIComponent(url.pathname.slice(TRADER_STATE_PATH.length + 1)),
      bodyDelayMs,
    );
  }
  return json({ error: "not found" }, 404);
};

/**
 * Offline loopback Phoenix Perps fixture over `Bun.serve`. Records every request (path plus
 * query, so tests can pin `traderPdaIndex=0`), answers by route, never contacts the real
 * endpoint.
 * @param {PhoenixScript} [script]
 * @param {{ delayMs?: number; bodyDelayMs?: number }} [options]
 */
export const startPhoenixFixture = (script = {}, options = {}) => {
  /** @type {Array<{ path: string; query: Record<string, string> }>} */
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
      await request.text();
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      return respond(script, url, options.bodyDelayMs ?? 0);
    },
  });
  return { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};
