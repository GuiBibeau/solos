// @ts-check
import { Database } from "bun:sqlite";
import { registerCapLedgerCases } from "@solos/core/strategy/cap-ledger-cases";
import { registerCapLedgerSettleCases } from "@solos/core/strategy/cap-ledger-settle-cases";
import { registerCapLedgerTickCases } from "@solos/core/strategy/cap-ledger-tick-cases";
import { Effect } from "effect";
import { sqliteCapLedger } from "./cap-ledger.js";

/** @typedef {import("@solos-sh/actions").StrategyBounds} StrategyBounds */

/**
 * @param {Record<string, StrategyBounds>} table
 * @param {readonly string[]} [engineMints]
 */
const open = (table, engineMints = []) => {
  const clock = { now: Date.UTC(2026, 0, 1, 12) };
  const db = new Database(":memory:");
  const layer = sqliteCapLedger(db, {
    boundsFor: (id) => table[id],
    now: () => clock.now,
    engineMints: () => engineMints,
  });
  /** @param {import("effect").Effect.Effect<unknown, unknown, import("@solos/core/strategy").CapLedgerShape>} effect */
  const run = (effect) => Effect.runPromise(effect.pipe(Effect.provide(layer)));
  return { clock, run };
};

/** @param {Record<string, StrategyBounds>} table */
const openSettle = (table) => open(table).run;

/** @param {import("effect").Effect.Effect<unknown, unknown, import("@solos/core/strategy").CapLedgerShape>} effect */
const runTick = (effect) => {
  const layer = sqliteCapLedger(new Database(":memory:"), {
    boundsFor: () => ({
      maxNotionalPerTickUsd: "100",
      maxDailySpendUsd: "1000",
      allowedMints: [],
      expiresAt: null,
      maxConsecutiveFailures: 3,
    }),
  });
  return Effect.runPromise(effect.pipe(Effect.provide(layer)));
};

registerCapLedgerCases("sqlite cap ledger", open);
registerCapLedgerSettleCases("sqlite cap ledger settle", openSettle);
registerCapLedgerTickCases("sqlite cap ledger tick", runTick);
