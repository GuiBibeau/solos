// @ts-check
import { PerpVenue } from "@solos/core";
import { Cause, Effect, Exit, Option } from "effect";
import { PerpVenueLive } from "./perp-venue-live.js";

/** @typedef {import("./phoenix-fixture.js").PhoenixScript} PhoenixScript */

/** @param {ReturnType<typeof import("./phoenix-fixture.js").startPhoenixFixture>} fixture @param {{ timeoutMs?: number; fetchImpl?: import("./phoenix-api.js").Fetch }} [overrides] */
const toConfig = (fixture, overrides) => ({
  baseUrl: fixture.url,
  timeoutMs: overrides?.timeoutMs,
  fetchImpl: overrides?.fetchImpl,
});

/** @param {import("@solos/core").GetPositionRequest} request */
const positionEffect = (request) =>
  Effect.gen(function* () {
    const venue = yield* PerpVenue;
    return yield* venue.getPosition(request);
  });

/** @param {string} owner */
const enumerationEffect = (owner) =>
  Effect.gen(function* () {
    const venue = yield* PerpVenue;
    return yield* venue.listPositions(owner);
  });

/**
 * Run the real adapter through its live Layer against the fixture and await the value.
 * @param {ReturnType<typeof import("./phoenix-fixture.js").startPhoenixFixture>} fixture
 * @param {import("@solos/core").GetPositionRequest} request
 * @param {{ timeoutMs?: number; fetchImpl?: import("./phoenix-api.js").Fetch }} [overrides]
 */
export const readThrough = (fixture, request, overrides) =>
  Effect.runPromise(positionEffect(request).pipe(Effect.provide(PerpVenueLive(toConfig(fixture, overrides)))));

/**
 * Read through the live Layer and hand back the tagged failure, or undefined on success.
 * @param {ReturnType<typeof import("./phoenix-fixture.js").startPhoenixFixture>} fixture
 * @param {import("@solos/core").GetPositionRequest} request
 * @param {{ timeoutMs?: number; fetchImpl?: import("./phoenix-api.js").Fetch }} [overrides]
 */
export const readFailure = async (fixture, request, overrides) => {
  const exit = await Effect.runPromiseExit(
    positionEffect(request).pipe(Effect.provide(PerpVenueLive(toConfig(fixture, overrides)))),
  );
  return failureOf(exit);
};

/**
 * Enumerate through the live Layer against the fixture.
 * @param {ReturnType<typeof import("./phoenix-fixture.js").startPhoenixFixture>} fixture
 * @param {string} owner
 * @param {{ timeoutMs?: number; fetchImpl?: import("./phoenix-api.js").Fetch }} [overrides]
 */
export const listThrough = (fixture, owner, overrides) =>
  Effect.runPromise(enumerationEffect(owner).pipe(Effect.provide(PerpVenueLive(toConfig(fixture, overrides)))));

/**
 * Enumerate through the live Layer and hand back the tagged failure, or undefined on success.
 * @param {ReturnType<typeof import("./phoenix-fixture.js").startPhoenixFixture>} fixture
 * @param {string} owner
 * @param {{ timeoutMs?: number; fetchImpl?: import("./phoenix-api.js").Fetch }} [overrides]
 */
export const listFailure = async (fixture, owner, overrides) => {
  const exit = await Effect.runPromiseExit(
    enumerationEffect(owner).pipe(Effect.provide(PerpVenueLive(toConfig(fixture, overrides)))),
  );
  return failureOf(exit);
};

/** @param {import("effect").Exit.Exit<unknown, unknown>} exit */
const failureOf = (exit) => {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) ? failure.value : undefined;
};
