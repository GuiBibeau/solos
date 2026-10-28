// @ts-check
import { PriceUnavailable } from "@solos/core";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect } from "effect";

/**
 * @typedef {{
 *   readonly getState: (request: { readonly owner: import("@solos-sh/actions").Address }) =>
 *     import("effect").Effect.Effect<import("@solos-sh/actions").PortfolioState, unknown, never>;
 * }} PortfolioRead
 * @typedef {{
 *   readonly signer: import("@solos/core/wallet").SignerShape;
 *   readonly balances: import("@solos/core/wallet").BalanceReaderShape;
 *   readonly portfolio: PortfolioRead;
 *   readonly feed: import("./tick-price.js").PriceReader;
 * }} RebalanceSources
 */

/**
 * Balances, decimals, and USD prices for a rebalance tick. A portfolio read that fails
 * falls back to wallet cash. `PriceUnavailable` becomes an empty price so evaluate names the mint.
 * `priceAt` is the oldest successful quote.
 * @param {RebalanceSources} sources
 * @param {{ readonly names: readonly string[]; readonly instant: number }} request
 */
export const readRebalance = (sources, request) =>
  Effect.gen(function* () {
    const owner = yield* sources.signer.address();
    const holdings = yield* cashHoldings(sources, owner);
    const mints = mintsOf(request.names);
    /** @type {Record<string, string | number>} */
    const out = { instant: request.instant };
    /** @type {number[]} */
    const stamps = [];
    for (const mint of mints) {
      const row = yield* oneMint({ feed: sources.feed, holdings, mint, instant: request.instant });
      Object.assign(out, row.fields);
      if (row.at !== undefined) stamps.push(row.at);
    }
    out.priceAt = stamps.length === 0 ? request.instant : Math.min(...stamps);
    return out;
  });

/** @param {readonly string[]} names */
const mintsOf = (names) => {
  /** @type {string[]} */
  const mints = [];
  for (const name of names) {
    if (name.startsWith("balance:")) mints.push(name.slice("balance:".length));
  }
  return mints;
};

/**
 * @param {RebalanceSources} sources
 * @param {string} owner
 */
const cashHoldings = (sources, owner) =>
  Effect.gen(function* () {
    const state = yield* sources.portfolio.getState({ owner }).pipe(Effect.either);
    if (state._tag === "Right") return rowsOf(state.right);
    const lamports = yield* sources.balances.getLamports(owner);
    const tokens = yield* sources.balances.getTokenBalances(owner);
    return walletRows(lamports, tokens);
  });

/** @param {{ cash: readonly unknown[]; positions: readonly unknown[] }} state */
const rowsOf = (state) => {
  /** @type {Map<string, { amount: string; decimals: number }>} */
  const map = new Map();
  for (const row of [...state.cash, ...state.positions]) {
    const token = tokenRow(row);
    if (token === undefined) continue;
    const prior = map.get(token.instrument);
    const amount = prior === undefined ? token.amount : add(prior.amount, token.amount);
    map.set(token.instrument, { amount, decimals: token.decimals });
  }
  return map;
};

/** @param {unknown} row */
const tokenRow = (row) => {
  if (typeof row !== "object" || row === null) return undefined;
  const token =
    /** @type {{ kind?: string; instrument?: string; amount?: string; decimals?: number }} */ (row);
  if (token.kind !== "token" || token.instrument === undefined || token.amount === undefined) {
    return undefined;
  }
  return { instrument: token.instrument, amount: token.amount, decimals: token.decimals ?? 0 };
};

/**
 * @param {bigint} lamports
 * @param {ReadonlyArray<{ mint: string; amount: string; decimals: number }>} tokens
 */
const walletRows = (lamports, tokens) => {
  /** @type {Map<string, { amount: string; decimals: number }>} */
  const map = new Map([["SOL", { amount: lamports.toString(), decimals: 9 }]]);
  for (const token of tokens)
    map.set(token.mint, { amount: token.amount, decimals: token.decimals });
  return map;
};

/**
 * @param {{
 *   feed: import("./tick-price.js").PriceReader;
 *   holdings: ReadonlyMap<string, { amount: string; decimals: number }>;
 *   mint: string;
 *   instant: number;
 * }} input
 */
const oneMint = (input) =>
  Effect.gen(function* () {
    const holding = holdingOf(input.holdings, input.mint);
    const priced = yield* input.feed.getPrice(input.mint).pipe(Effect.either);
    if (priced._tag === "Right") return quoted(input.mint, holding, priced.right);
    if (priced.left instanceof PriceUnavailable)
      return quoted(input.mint, holding, empty(input.instant));
    return yield* Effect.fail({
      reason: text(priced.left, "reason", "the price feed failed"),
      remedy: text(priced.left, "remedy", "retry when the price feed is available"),
    });
  });

/** @param {number} instant */
const empty = (instant) => ({ priceUsd: "", at: instant });

/**
 * @param {string} mint
 * @param {{ amount: string; decimals: number }} holding
 * @param {{ priceUsd: string; at: number }} price
 */
const quoted = (mint, holding, price) => ({
  at: price.priceUsd.length === 0 ? undefined : price.at,
  fields: {
    [`balance:${mint}`]: holding.amount,
    [`decimals:${mint}`]: holding.decimals,
    [`price:${mint}`]: price.priceUsd,
    [`priceAt:${mint}`]: price.at,
  },
});

/**
 * @param {ReadonlyMap<string, { amount: string; decimals: number }>} holdings
 * @param {string} mint
 */
const holdingOf = (holdings, mint) => {
  if (mint !== WSOL_MINT) return holdings.get(mint) ?? { amount: "0", decimals: 0 };
  const native = holdings.get("SOL")?.amount ?? "0";
  const wrapped = holdings.get(WSOL_MINT)?.amount ?? "0";
  return { amount: add(native, wrapped), decimals: 9 };
};

/** @param {string} left @param {string} right */
const add = (left, right) => (BigInt(left) + BigInt(right)).toString();

/** @param {unknown} error @param {"reason" | "remedy"} key @param {string} fallback */
const text = (error, key, fallback) => {
  if (typeof error !== "object" || error === null || !Object.hasOwn(error, key)) return fallback;
  const value = /** @type {Record<string, unknown>} */ (error)[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
};
