// @ts-check
import { Effect } from "effect";
import { registerCapLedgerSettleCases } from "./cap-ledger-settle-cases.test.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";

/** @param {Record<string, import("@solos-sh/actions").StrategyBounds>} table */
const open = (table) => {
  const layer = memoryCapLedger({ boundsFor: (id) => table[id] });
  return (
    /** @type {import("effect").Effect.Effect<unknown, unknown, import("../ports/cap-ledger.js").CapLedgerShape>} */ effect,
  ) => Effect.runPromise(effect.pipe(Effect.provide(layer)));
};

registerCapLedgerSettleCases("memory cap ledger settle", open);
