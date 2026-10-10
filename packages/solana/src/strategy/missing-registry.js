// @ts-check
import { EngineConfigMissing, StrategyRegistry } from "@solos/core";
import { Effect, Layer } from "effect";

const missing = new EngineConfigMissing({
  reason: "strategy tools need an Engine, and SOLOS_EXECUTOR is direct",
  remedy: "set SOLOS_EXECUTOR=engine and export SOLOS_ENGINE_URL",
});

const refused = () => Effect.fail(missing);

/**
 * Direct mode has no Engine, so a strategy tool fails with a configuration error instead of
 * a missing Effect service.
 */
const service = {
  register: refused,
  update: refused,
  list: refused,
  get: refused,
  simulateRegister: refused,
  simulateUpdate: refused,
};

export const MissingStrategyRegistry = Layer.succeed(
  StrategyRegistry,
  /** @type {import("@solos/core/strategy").StrategyRegistryShape} */ (
    /** @type {unknown} */ (service)
  ),
);
