// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { BoundsExceeded } from "../../shared/domain/engine-errors.js";
import { CapLedger } from "../ports/cap-ledger.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** @param {string} tickId @param {string} intentId @param {string} notionalUsd */
const req = (tickId, intentId, notionalUsd) => ({
  strategyId: "s",
  tickId,
  intentId,
  notionalUsd,
  mint: USDC,
});

/** @param {unknown} error */
const tickBound = (error) => {
  expect(error).toBeInstanceOf(BoundsExceeded);
  expect(/** @type {BoundsExceeded} */ (error).bound).toBe("maxNotionalPerTickUsd");
};

/**
 * One ledger for the whole suite, so later cases see earlier holds.
 * @typedef {(
 *   effect: import("effect").Effect.Effect<unknown, unknown, import("../ports/cap-ledger.js").CapLedgerShape>,
 * ) => Promise<unknown>} RunTick
 */

/**
 * Tick sums shared by every cap ledger adapter.
 * @param {string} title
 * @param {RunTick} run
 */
export const registerCapLedgerTickCases = (title, run) => {
  describe(title, () => {
    test("two Actions under the cap alone are refused when one tick would pass it", async () => {
      await run(
        Effect.gen(function* () {
          const ledger = yield* CapLedger;
          yield* ledger.reserve(req("tick-a", "a", "60"));
          tickBound(yield* ledger.reserve(req("tick-a", "b", "60")).pipe(Effect.flip));
          yield* ledger.reserve({ ...req("tick-a", "other", "60"), strategyId: "other" });
        }),
      );
    });

    test("the same total on two ticks is allowed, including an exact fill", async () => {
      await run(
        Effect.gen(function* () {
          const ledger = yield* CapLedger;
          yield* ledger.reserve(req("tick-a", "a", "60"));
          yield* ledger.reserve(req("tick-b", "b", "60"));
          yield* ledger.reserve(req("tick-b", "c", "40"));
        }),
      );
    });

    test("a repeat of the same intentId does not count toward the tick twice", async () => {
      await run(
        Effect.gen(function* () {
          const ledger = yield* CapLedger;
          const first = yield* ledger.reserve(req("tick-a", "a", "60"));
          const again = yield* ledger.reserve(req("tick-a", "a", "60"));
          expect(again.reservationId).toBe(first.reservationId);
          yield* ledger.reserve(req("tick-a", "b", "40"));
        }),
      );
    });

    test("a settled amount replaces the reserved amount on the tick", async () => {
      await run(
        Effect.gen(function* () {
          const ledger = yield* CapLedger;
          const held = yield* ledger.reserve(req("tick-a", "a", "60"));
          yield* ledger.settle(held.reservationId, "20");
          yield* ledger.reserve(req("tick-a", "b", "80"));
        }),
      );
    });

    test("releasing a reservation frees room on its tick", async () => {
      await run(
        Effect.gen(function* () {
          const ledger = yield* CapLedger;
          const held = yield* ledger.reserve(req("tick-a", "a", "60"));
          tickBound(yield* ledger.reserve(req("tick-a", "b", "50")).pipe(Effect.flip));
          yield* ledger.release(held.reservationId);
          yield* ledger.reserve(req("tick-a", "b", "50"));
        }),
      );
    });
  });
};
