// @ts-check
import { Effect, Layer } from "effect";
import { PriceFeed } from "../../market/index.js";
import { CadenceFloor } from "../ports/cadence-floor.js";
import { EngineAllowlist } from "../ports/engine-allowlist.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRegistry } from "../ports/strategy-registry.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickRepository } from "../ports/tick-repository.js";
import { performGet, performGetTicks, performList } from "./perform-read.js";
import { performRegister } from "./perform-register.js";
import { performSimulateRegister } from "./perform-simulate.js";
import { performSimulateUpdate, performUpdate } from "./perform-update.js";

/**
 * @typedef {{
 *   readonly repository: import("../ports/strategy-repository.js").StrategyRepositoryShape;
 *   readonly allowlist: import("../ports/engine-allowlist.js").EngineAllowlistShape;
 *   readonly ids: import("../ports/strategy-ids.js").StrategyIdsShape;
 *   readonly floor: import("../ports/cadence-floor.js").CadenceFloorShape;
 *   readonly ticks: import("../ports/tick-repository.js").TickRepositoryShape;
 * }} CapturedPorts
 */

/**
 * Capture the ports the use cases need so each Registry method returns an effect with no
 * remaining requirements. The layer itself still requires those ports at build time.
 * @param {CapturedPorts} ports
 */
const captured = (ports) =>
  Layer.mergeAll(
    Layer.succeed(StrategyRepository, ports.repository),
    Layer.succeed(EngineAllowlist, ports.allowlist),
    Layer.succeed(StrategyIds, ports.ids),
    Layer.succeed(CadenceFloor, ports.floor),
    Layer.succeed(TickRepository, ports.ticks),
  );

/**
 * The in-process Registry. It runs the use cases, so the state table stays in one place.
 * The runtime that provides this layer also provides the repository, the allowlist, ids, and
 * the price feed.
 */
export const InProcessStrategyRegistry = Layer.effect(
  StrategyRegistry,
  Effect.gen(function* () {
    const deps = Layer.mergeAll(
      captured({
        repository: yield* StrategyRepository,
        allowlist: yield* EngineAllowlist,
        ids: yield* StrategyIds,
        floor: yield* CadenceFloor,
        ticks: yield* TickRepository,
      }),
      Layer.succeed(PriceFeed, yield* PriceFeed),
    );
    return {
      register: (draft) => performRegister(draft).pipe(Effect.provide(deps)),
      update: (id, state) => performUpdate(id, state).pipe(Effect.provide(deps)),
      list: (filter) => performList(filter).pipe(Effect.provide(deps)),
      get: (id) => performGet(id).pipe(Effect.provide(deps)),
      ticks: (input) => performGetTicks(input).pipe(Effect.provide(deps)),
      simulateRegister: (draft) => performSimulateRegister(draft).pipe(Effect.provide(deps)),
      simulateUpdate: (id, state) => performSimulateUpdate(id, state).pipe(Effect.provide(deps)),
    };
  }),
);

/** Tools and the CLI call these. They reach whichever Registry adapter the process provided. */
export const registerStrategy = (/** @type {unknown} */ draft) =>
  Effect.flatMap(StrategyRegistry, (registry) => registry.register(draft));

/** @param {string} id @param {string} state */
export const updateStrategy = (id, state) =>
  Effect.flatMap(StrategyRegistry, (registry) => registry.update(id, state));

/** @param {{ state?: string; owner?: string }} filter */
export const listStrategies = (filter) =>
  Effect.flatMap(StrategyRegistry, (registry) => registry.list(filter));

/** @param {string} id */
export const getStrategyStatus = (id) =>
  Effect.flatMap(StrategyRegistry, (registry) => registry.get(id));

/** @param {{ id: string; limit?: number; outcome?: string }} input */
export const getStrategyTicks = (input) =>
  Effect.flatMap(StrategyRegistry, (registry) => registry.ticks(input));

/** @param {unknown} draft */
export const simulateRegisterStrategy = (draft) =>
  Effect.flatMap(StrategyRegistry, (registry) => registry.simulateRegister(draft));

/** @param {string} id @param {string} state */
export const simulateUpdateStrategy = (id, state) =>
  Effect.flatMap(StrategyRegistry, (registry) => registry.simulateUpdate(id, state));
