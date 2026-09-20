// @ts-check
import {
  LendingMarketUnavailable,
  LendingObligationInvalid,
  LendingTimeout,
  ReserveUnavailable,
} from "@solos/core/lend";
import { Effect } from "effect";
import {
  ledgerInstant,
  loadBareKaminoMarket,
  validateReserveLayout,
} from "./kamino-market-reader.js";
import { mapLendEnumeration, mapLendPosition } from "./kamino-position-map.js";
import { ownerObligations, positionReserves } from "./kamino-position-reader.js";

/** @typedef {{ rpc: any; origin: string; market: string; timeoutMs: number }} PositionRead */

/** @param {PositionRead} deps */
const requiredMarket = (deps) =>
  Effect.flatMap(loadBareKaminoMarket(deps.rpc, deps.market, deps.origin), (market) =>
    market === null
      ? Effect.fail(
          new LendingMarketUnavailable({
            market: deps.market,
            reason: "the configured lending market account is missing on the configured RPC",
          }),
        )
      : Effect.succeed(market),
  );

/** @param {PositionRead} deps */
const positionState = (deps) =>
  Effect.gen(function* () {
    const market = yield* requiredMarket(deps);
    const instant = yield* ledgerInstant(deps.rpc, deps.origin);
    const reserves = yield* positionReserves({
      rpc: deps.rpc,
      market,
      instant,
      origin: deps.origin,
    });
    return { reserves, market };
  });

/** @param {PositionRead} deps @param {{ mint: string; owner: string }} request */
const readPosition = (deps, request) =>
  Effect.gen(function* () {
    yield* validateReserveLayout(deps.rpc, {
      ...request,
      market: deps.market,
      origin: deps.origin,
    });
    const [{ reserves }, rows] = yield* Effect.all([
      positionState(deps),
      ownerObligations(deps.rpc, { ...request, market: deps.market, origin: deps.origin }),
    ]);
    const descriptor = reserves.find(
      /** @param {{ mint: string }} item */ (item) => item.mint === request.mint,
    );
    if (descriptor === undefined) {
      return yield* new ReserveUnavailable({
        market: deps.market,
        mint: request.mint,
        reason: "the configured market has no float-rate reserve for this mint",
      });
    }
    return yield* Effect.try({
      try: () => mapLendPosition(descriptor, rows, deps.market),
      catch: () =>
        new LendingObligationInvalid({
          obligation: "11111111111111111111111111111111",
          reason: "obligation amounts or reserve exchange rates are invalid",
        }),
    });
  }).pipe(
    Effect.timeoutFail({
      duration: deps.timeoutMs,
      onTimeout: () => new LendingTimeout({ timeoutMs: deps.timeoutMs }),
    }),
  );

/** @param {PositionRead} deps @param {string} owner */
const listPositions = (deps, owner) =>
  Effect.gen(function* () {
    const [{ reserves }, rows] = yield* Effect.all([
      positionState(deps),
      ownerObligations(deps.rpc, { owner, market: deps.market, origin: deps.origin }),
    ]);
    return yield* mapLendEnumeration({ market: deps.market, reserves, rows });
  }).pipe(
    Effect.timeoutFail({
      duration: deps.timeoutMs,
      onTimeout: () => new LendingTimeout({ timeoutMs: deps.timeoutMs }),
    }),
  );

/** @param {PositionRead} deps */
export const makePositionReads = (deps) => ({
  getPosition: /** @param {{ mint: string; owner: string }} request */ (request) =>
    readPosition(deps, request),
  listPositions: /** @param {string} owner */ (owner) => listPositions(deps, owner),
});
