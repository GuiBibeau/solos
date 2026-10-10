// @ts-check
import { CapLedger, EngineConfigMissing, StrategyRegistry } from "@solos/core";
import { Effect, Layer } from "effect";

const missing = new EngineConfigMissing({
  reason: "strategy tools need an Engine, and SOLOS_EXECUTOR is direct",
  remedy: "set SOLOS_EXECUTOR=engine and export SOLOS_ENGINE_URL",
});

const refused = () => Effect.fail(missing);

const registry = {
  register: refused,
  update: refused,
  list: refused,
  get: refused,
  simulateRegister: refused,
  simulateUpdate: refused,
};

const ledger = {
  reserve: refused,
  settle: refused,
  release: refused,
  engage: refused,
  disengage: refused,
  status: refused,
};

/** Direct mode has no Engine, so a strategy tool fails with a configuration error. */
export const MissingStrategyRegistry = Layer.succeed(
  StrategyRegistry,
  /** @type {import("@solos/core/strategy").StrategyRegistryShape} */ (
    /** @type {unknown} */ (registry)
  ),
);

/** Direct mode has no cap ledger. Kill-switch tools fail the same way the Registry does. */
export const MissingCapLedger = Layer.succeed(
  CapLedger,
  /** @type {import("@solos/core/strategy").CapLedgerShape} */ (/** @type {unknown} */ (ledger)),
);

/** Both caller ports, for the direct-mode composition root. */
export const MissingCallerPorts = Layer.mergeAll(MissingStrategyRegistry, MissingCapLedger);
