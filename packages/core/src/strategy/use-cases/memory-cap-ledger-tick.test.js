// @ts-check
import { Effect } from "effect";
import { registerCapLedgerTickCases } from "./cap-ledger-tick-cases.test.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";

const layer = memoryCapLedger({
  boundsFor: () => ({
    maxNotionalPerTickUsd: "100",
    maxDailySpendUsd: "1000",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 3,
  }),
});

/** @param {import("effect").Effect.Effect<unknown, unknown, import("../ports/cap-ledger.js").CapLedgerShape>} effect */
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provide(layer)));

registerCapLedgerTickCases("memory cap ledger tick", run);
