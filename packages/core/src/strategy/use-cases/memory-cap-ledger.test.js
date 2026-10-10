// @ts-check
import { Effect } from "effect";
import { registerCapLedgerCases } from "./cap-ledger-cases.test.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";

/**
 * @param {Record<string, import("@solos-sh/actions").StrategyBounds>} table
 * @param {readonly string[]} [engineMints]
 */
const open = (table, engineMints = []) => {
  const clock = { now: Date.UTC(2026, 0, 1, 12) };
  const layer = memoryCapLedger({
    boundsFor: (id) => table[id],
    now: () => clock.now,
    engineMints: () => engineMints,
  });
  /** @param {import("effect").Effect.Effect<unknown, unknown, import("../ports/cap-ledger.js").CapLedgerShape>} effect */
  const run = (effect) => Effect.runPromise(effect.pipe(Effect.provide(layer)));
  return { clock, run };
};

registerCapLedgerCases("memory cap ledger", open);
