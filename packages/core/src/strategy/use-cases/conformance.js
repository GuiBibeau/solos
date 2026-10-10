// @ts-check
import { Effect } from "effect";
import { StrategyRegistry } from "../ports/strategy-registry.js";
import { StrategyRepository } from "../ports/strategy-repository.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";
const ACTION = /** @type {const} */ ({ type: "transfer_sol", to: USDC, lamports: "1" });

const bounds = (/** @type {string[]} */ allowedMints) => ({
  maxNotionalPerTickUsd: "1",
  maxDailySpendUsd: "2",
  allowedMints,
  expiresAt: null,
  maxConsecutiveFailures: 2,
});

const schedule = {
  owner: "swarm",
  kind: "schedule",
  params: { actions: [ACTION], count: 2 },
  tickSource: { type: "clock", every: 60_000 },
  bounds: bounds([]),
};

const trigger = {
  owner: "swarm",
  kind: "trigger",
  params: {
    observe: { price: USDC },
    condition: "above",
    priceUsd: "100",
    action: ACTION,
  },
  tickSource: { type: "clock", cron: "0 * * * *" },
  bounds: bounds([USDC]),
};

const widening = { ...schedule, owner: "other", bounds: bounds([WSOL]) };

/**
 * Both repository adapters run this effect. It fails when a row does not round-trip.
 */
export const repositoryConformance = Effect.gen(function* () {
  const repo = yield* StrategyRepository;
  const strategy = yield* stored();
  yield* repo.save(strategy);
  const loaded = yield* repo.load(strategy.id);
  yield* eq("owner", loaded?.owner, "swarm");
  yield* eq("list", (yield* repo.list({ owner: "swarm" })).length, 1);
  yield* eq("byState", (yield* repo.byState("active")).length, 1);
  yield* eq("other", (yield* repo.list({ owner: "nope" })).length, 0);
  yield* repo.save({ ...strategy, state: /** @type {const} */ ("paused") });
  yield* eq("paused", (yield* repo.load(strategy.id))?.state, "paused");
});

/** The allowlist under test is `[USDC]`. The price feed answers `150` for that mint. */
export const registryConformance = Effect.gen(function* () {
  const registry = yield* StrategyRegistry;
  yield* preview(registry);
  yield* lifecycle(registry, yield* registry.register(schedule));
  yield* wideningCheck(registry);
});

/** @param {import("../ports/strategy-registry.js").StrategyRegistryShape} registry */
const preview = (registry) =>
  Effect.gen(function* () {
    yield* eq("empty", (yield* registry.list({})).strategies.length, 0);
    const scheduled = yield* registry.simulateRegister(schedule);
    yield* eq("schedule actions", scheduled.actions.length, 1);
    yield* eq("schedule price", scheduled.price, null);
    yield* eq("untouched", (yield* registry.list({})).strategies.length, 0);
    const fired = yield* registry.simulateRegister(trigger);
    yield* eq("trigger price", fired.price?.priceUsd, "150");
    yield* eq("trigger actions", fired.actions.length, 1);
  });

/**
 * @param {import("../ports/strategy-registry.js").StrategyRegistryShape} registry
 * @param {{ id: string; state: string }} registered
 */
const lifecycle = (registry, registered) =>
  Effect.gen(function* () {
    yield* eq("active", registered.state, "active");
    const id = registered.id;
    yield* registry.update(id, "paused");
    yield* registry.update(id, "active");
    yield* registry.update(id, "done");
    yield* cancelled(registry, id);
    const previewUpdate = yield* registry.simulateUpdate(id, "active");
    yield* eq("allowed", previewUpdate.allowed, false);
    yield* eq("still done", (yield* registry.get(id)).state, "done");
  });

/**
 * @param {import("../ports/strategy-registry.js").StrategyRegistryShape} registry
 * @param {string} id
 */
const cancelled = (registry, id) =>
  Effect.gen(function* () {
    const again = yield* Effect.either(registry.update(id, "done"));
    if (again._tag !== "Left" || again.left._tag !== "StrategyTransitionRefused") {
      return yield* Effect.fail("cancel from done was allowed");
    }
    yield* eq("from", again.left.from, "done");
    yield* eq("to", again.left.to, "done");
  });

/** @param {import("../ports/strategy-registry.js").StrategyRegistryShape} registry */
const wideningCheck = (registry) =>
  Effect.gen(function* () {
    const refused = yield* Effect.either(registry.register(widening));
    if (refused._tag !== "Left" || refused.left._tag !== "BoundsExceeded") {
      return yield* Effect.fail("a widening mint was stored");
    }
    yield* eq("mint", refused.left.requested, WSOL);
    yield* eq("one row", (yield* registry.list({})).strategies.length, 1);
  });

const stored = () =>
  Effect.sync(() => ({
    schemaVersion: /** @type {const} */ (1),
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    owner: "swarm",
    kind: /** @type {const} */ ("schedule"),
    params: { actions: [ACTION] },
    tickSource: { type: /** @type {const} */ ("clock"), every: 1000 },
    bounds: bounds([]),
    state: /** @type {const} */ ("active"),
    createdAt: 0,
    expiresAt: null,
  }));

/**
 * @param {string} label
 * @param {unknown} actual
 * @param {unknown} expected
 */
const eq = (label, actual, expected) => {
  if (actual !== expected) {
    return Effect.fail(`${label}: ${String(actual)} !== ${String(expected)}`);
  }
  return Effect.void;
};
