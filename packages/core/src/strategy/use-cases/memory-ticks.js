// @ts-check
import { Effect, Layer } from "effect";
import { TickRepository } from "../ports/tick-repository.js";

const DEFAULT_WINDOW = 50;

/**
 * In-memory Tick record. `list` is the complete record. `recent` is the bounded window.
 * @param {number} [window]
 */
export const memoryTickRepository = (window = DEFAULT_WINDOW) => {
  /** @type {import("../domain/tick.js").Tick[]} */
  const rows = [];
  /** @type {Map<string, import("../domain/tick.js").Tick[]>} */
  const recent = new Map();
  return Layer.sync(TickRepository, () => ({
    save: (tick) => Effect.sync(() => store({ rows, recent, window }, tick)),
    list: (query) => Effect.sync(() => listed(rows, query)),
    recent: (strategyId) => Effect.sync(() => recent.get(strategyId) ?? []),
  }));
};

/**
 * @param {{
 *   rows: import("../domain/tick.js").Tick[];
 *   recent: Map<string, import("../domain/tick.js").Tick[]>;
 *   window: number;
 * }} book
 * @param {import("../domain/tick.js").Tick} tick
 */
const store = (book, tick) => {
  const index = book.rows.findIndex((row) => row.tickId === tick.tickId);
  if (index === -1) book.rows.push(tick);
  else book.rows[index] = tick;
  const prior = (book.recent.get(tick.strategyId) ?? []).filter(
    (row) => row.tickId !== tick.tickId,
  );
  book.recent.set(tick.strategyId, [tick, ...prior].slice(0, book.window));
};

/**
 * @param {readonly import("../domain/tick.js").Tick[]} rows
 * @param {import("../ports/tick-repository.js").TickQuery} query
 */
const listed = (rows, query) =>
  rows
    .filter((row) => row.strategyId === query.strategyId)
    .filter((row) => query.outcome === undefined || row.outcome === query.outcome)
    .toSorted((left, right) => right.startedAt - left.startedAt)
    .slice(0, query.limit ?? 20);
