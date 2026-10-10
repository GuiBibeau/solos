// @ts-check
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BoundsExceeded, CapLedger, GLOBAL_KILL_SCOPE, KillSwitchEngaged } from "@solos/core";
import { Effect } from "effect";
import { sqliteCapLedger } from "./cap-ledger.js";

/** @typedef {import("@solos-sh/actions").StrategyBounds} StrategyBounds */
/** @typedef {Record<string, StrategyBounds>} BoundsTable */

/** @param {Partial<StrategyBounds>} [patch] @returns {StrategyBounds} */
const bounds = (patch = {}) => ({
  maxNotionalPerTickUsd: "100",
  maxDailySpendUsd: "5",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 3,
  ...patch,
});

/**
 * @param {BoundsTable} table
 */
const session = (table) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "cap-ledger-")), "ledger.sqlite");
  const clock = { now: Date.UTC(2026, 0, 1, 12) };
  const open = () => {
    const db = new Database(file);
    db.exec("PRAGMA journal_mode = WAL");
    const layer = sqliteCapLedger(db, {
      boundsFor: (id) => table[id],
      now: () => clock.now,
    });
    /** @param {import("effect").Effect.Effect<unknown, unknown, import("@solos/core/strategy").CapLedgerShape>} effect */
    const run = (effect) => Effect.runPromise(effect.pipe(Effect.provide(layer)));
    return { db, run };
  };
  return { clock, open };
};

/** @param {string} strategyId @param {string} intentId @param {string} notionalUsd */
const req = (strategyId, intentId, notionalUsd) => ({
  strategyId,
  tickId: intentId,
  intentId,
  notionalUsd,
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
});

/** @param {ReturnType<typeof req>} request @param {string} tickId */
const onTick = (request, tickId) => ({ ...request, tickId });

describe("sqlite cap ledger survives closing the database", () => {
  test("an idempotent intent id and a settled amount keep their headroom", async () => {
    const { open } = session({ s: bounds() });
    const first = open();
    const held = await first.run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const reserved = yield* ledger.reserve(req("s", "a", "4"));
        yield* ledger.settle(reserved.reservationId, "1");
        return reserved.reservationId;
      }),
    );
    first.db.close();
    const second = open();
    await second.run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const again = yield* ledger.reserve(req("s", "a", "99"));
        expect(again.reservationId).toBe(held);
        yield* ledger.reserve(req("s", "b", "4"));
        const over = yield* ledger.reserve(req("s", "c", "0.01")).pipe(Effect.flip);
        expect(over).toBeInstanceOf(BoundsExceeded);
      }),
    );
    second.db.close();
  });

  test("a per-tick sum and both kill switches stay engaged", async () => {
    const wide = bounds({ maxDailySpendUsd: "1000" });
    const { open } = session({ a: wide, b: wide });
    const first = open();
    await first.run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        yield* ledger.reserve(onTick(req("a", "a1", "60"), "tick-a"));
        yield* ledger.engage({ scope: "a", reason: "strategy halt" });
        yield* ledger.engage({ scope: GLOBAL_KILL_SCOPE, reason: "all stop" });
      }),
    );
    first.db.close();
    const second = open();
    await second.run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const tick = yield* ledger
          .reserve(onTick(req("b", "b1", "50"), "tick-a"))
          .pipe(Effect.flip);
        expect(tick).toBeInstanceOf(KillSwitchEngaged);
        expect(/** @type {KillSwitchEngaged} */ (tick).scope).toBe(GLOBAL_KILL_SCOPE);
        yield* ledger.disengage(GLOBAL_KILL_SCOPE);
        const blocked = yield* ledger
          .reserve(onTick(req("a", "a2", "1"), "tick-b"))
          .pipe(Effect.flip);
        expect(blocked).toBeInstanceOf(KillSwitchEngaged);
        expect(/** @type {KillSwitchEngaged} */ (blocked).scope).toBe("a");
        yield* ledger.disengage("a");
        const over = yield* ledger
          .reserve(onTick(req("a", "a3", "50"), "tick-a"))
          .pipe(Effect.flip);
        expect(/** @type {BoundsExceeded} */ (over).bound).toBe("maxNotionalPerTickUsd");
        yield* ledger.reserve(onTick(req("a", "a4", "40"), "tick-b"));
      }),
    );
    second.db.close();
  });

  test("an overshoot and the per-Strategy switch it engaged survive", async () => {
    const { open } = session({ high: bounds() });
    const first = open();
    await first.run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const held = yield* ledger.reserve(req("high", "over", "2"));
        yield* ledger.settle(held.reservationId, "3.50");
      }),
    );
    first.db.close();
    const second = open();
    await second.run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const status = yield* ledger.status("high");
        expect(status.engaged).toBe(true);
        expect(status.reason).toContain("1.50");
        yield* ledger.disengage("high");
        const still = yield* ledger.reserve(req("high", "too-much", "2")).pipe(Effect.flip);
        expect(/** @type {BoundsExceeded} */ (still).bound).toBe("maxDailySpendUsd");
        yield* ledger.reserve(req("high", "fits", "1.50"));
      }),
    );
    second.db.close();
  });
});

describe("sqlite cap ledger writes are one transaction", () => {
  test("a failed insert rolls the reservation and its id back", async () => {
    const { open } = session({ s: bounds() });
    const { db, run } = open();
    db.exec(
      "CREATE TRIGGER abort_insert BEFORE INSERT ON cap_reservations BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    await expect(
      run(Effect.flatMap(CapLedger, (ledger) => ledger.reserve(req("s", "a", "1")))),
    ).rejects.toThrow("boom");
    db.exec("DROP TRIGGER abort_insert");
    const held = await run(
      Effect.flatMap(CapLedger, (ledger) => ledger.reserve(req("s", "a", "1"))),
    );
    expect(held.reservationId).toBe("res_1");
    const rows = db.query("SELECT COUNT(*) AS n FROM cap_reservations").get();
    expect(/** @type {{ n: number }} */ (rows).n).toBe(1);
    db.close();
  });

  test("a failed kill rolls the settle back and the hold stays open", async () => {
    const { open } = session({ s: bounds() });
    const { db, run } = open();
    const held = await run(
      Effect.flatMap(CapLedger, (ledger) => ledger.reserve(req("s", "a", "2"))),
    );
    db.exec(
      "CREATE TRIGGER abort_kill BEFORE INSERT ON cap_kills BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    await expect(
      run(Effect.flatMap(CapLedger, (ledger) => ledger.settle(held.reservationId, "3.50"))),
    ).rejects.toThrow("boom");
    const row = db
      .query("SELECT status FROM cap_reservations WHERE reservation_id = ?")
      .get(held.reservationId);
    expect(/** @type {{ status: string }} */ (row).status).toBe("open");
    expect(db.query("SELECT COUNT(*) AS n FROM cap_kills").get()).toEqual({ n: 0 });
    db.close();
  });
});
