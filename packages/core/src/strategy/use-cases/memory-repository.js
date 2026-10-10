// @ts-check
import { Effect, Layer } from "effect";
import { StrategyRepository } from "../ports/strategy-repository.js";

/** In-memory repository. Tests and the in-process conformance use it. The Engine uses SQLite. */
export const memoryStrategyRepository = () => {
  /** @type {Map<string, import("@solos-sh/actions").Strategy>} */
  const rows = new Map();
  return Layer.sync(StrategyRepository, () => ({
    save: (strategy) => Effect.sync(() => void rows.set(strategy.id, strategy)),
    load: (id) => Effect.sync(() => rows.get(id)),
    list: (filter) => Effect.sync(() => listed(rows, filter)),
    byState: (state) => Effect.sync(() => listed(rows, { state })),
  }));
};

/**
 * @param {Map<string, import("@solos-sh/actions").Strategy>} rows
 * @param {{ state?: string; owner?: string }} filter
 */
const listed = (rows, filter) => {
  /** @type {import("@solos-sh/actions").Strategy[]} */
  const found = [];
  for (const row of rows.values()) {
    if (isListed(row, filter)) found.push(row);
  }
  return found;
};

/**
 * @param {import("@solos-sh/actions").Strategy} row
 * @param {{ state?: string; owner?: string }} filter
 */
const isListed = (row, filter) =>
  (filter.state === undefined || row.state === filter.state) &&
  (filter.owner === undefined || row.owner === filter.owner);
