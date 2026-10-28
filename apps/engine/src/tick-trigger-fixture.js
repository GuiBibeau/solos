// @ts-check
import { engineFetch, startTestEngine } from "./engine-fixture.js";

const WSOL = "So11111111111111111111111111111111111111112";

export const EVERY = 60_000;
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOL = WSOL;

/** Loopback Jupiter price so the spend meter and the swap builder have a base URL. */
export const prices = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (!url.pathname.includes("/price/")) return new Response("no route", { status: 500 });
      const ids = url.searchParams.get("ids") ?? WSOL;
      return Response.json({
        [ids]: { usdPrice: 150, blockId: 1, decimals: 9, priceChange24h: 0 },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** @param {number} [start] */
export const clock = (start = 1_700_000_000_000) => {
  const state = { now: start };
  return {
    now: () => state.now,
    advance: (ms = EVERY) => {
      state.now += ms;
    },
  };
};

export const bounds = {
  maxNotionalPerTickUsd: "100",
  maxDailySpendUsd: "1000",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 3,
};

/**
 * @typedef {{
 *   price?: string;
 *   at?: number;
 *   error?: { reason: string; remedy?: string };
 *   quote?: import("./strategy-layer.js").StrategyLayerOptions["quote"];
 * }} PriceBook
 */

/**
 * @param {ReturnType<typeof prices>} feed
 * @param {ReturnType<typeof clock>} time
 * @param {PriceBook & { extra?: import("./engine-test-env.js").TestEngineOptions }} options
 */
export const bootTrigger = (feed, time, options) =>
  startTestEngine({
    strategies: true,
    tier: "execute",
    allowedMints: [],
    now: time.now,
    observations: () => scripted(options, time.now()),
    quote: (action) => liveQuote(options.quote, action),
    env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    ...options.extra,
  });

const FALLBACK_QUOTE = {
  reserveUsd: "2",
  actualUsd: "1",
  mint: WSOL,
  solPriceUsd: "150",
};

/**
 * @param {PriceBook["quote"]} quote
 * @param {import("@solos-sh/actions").Action} action
 */
const liveQuote = (quote, action) => {
  if (typeof quote === "function") return quote(action);
  return quote ?? FALLBACK_QUOTE;
};

/** @param {PriceBook} book @param {number} now */
const scripted = (book, now) => {
  if (book.error !== undefined) throw book.error;
  /** @type {Record<string, string | number>} */
  const out = { priceAt: book.at ?? now };
  if (book.price !== undefined) out.price = book.price;
  return out;
};

/**
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} [patch]
 */
export const triggerDraft = (params, patch = {}) => ({
  owner: "swarm",
  kind: "trigger",
  params: { observe: { price: SOL }, once: true, ...params },
  tickSource: { type: "clock", every: EVERY },
  bounds,
  ...patch,
});

/** @param {{ url: string; token: string }} engine @param {string} id */
export const ticksOf = async (engine, id) => {
  const response = await engineFetch(engine, `/v1/strategies/${id}/ticks`);
  if (response.status !== 200) throw new Error(`ticks ${response.status}`);
  return response.body.ticks;
};

/** @param {{ url: string; token: string }} engine @param {string} id */
export const statusOf = async (engine, id) => {
  const response = await engineFetch(engine, `/v1/strategies/${id}`);
  if (response.status !== 200) throw new Error(`status ${response.status}`);
  return response.body;
};
