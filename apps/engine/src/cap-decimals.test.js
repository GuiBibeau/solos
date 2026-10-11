// @ts-check
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { CapLedger } from "@solos/core";
import { MintDecimals, MintDecimalsUnverified } from "@solos/core/strategy";
import { Effect, Layer } from "effect";
import { sqliteCapLedger } from "./cap-ledger.js";

const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

const bounds = {
  maxNotionalPerTickUsd: "10",
  maxDailySpendUsd: "10",
  allowedMints: /** @type {readonly string[]} */ ([]),
  expiresAt: null,
  maxConsecutiveFailures: 1,
};

describe("sqlite cap ledger decimals", () => {
  test("an unverified mint stores no reservation", async () => {
    const db = new Database(":memory:");
    const layer = Layer.mergeAll(
      sqliteCapLedger(db, { boundsFor: () => bounds }),
      Layer.succeed(MintDecimals, {
        decimalsOf: () => Effect.succeed(undefined),
      }),
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        return yield* ledger
          .reserve({
            strategyId: "s",
            tickId: "t",
            intentId: "i",
            notionalUsd: "1",
            mint: USDT,
          })
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );
    const row = /** @type {{ n: number }} */ (
      db.query("select count(*) as n from cap_reservations").get()
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") expect(result.left).toBeInstanceOf(MintDecimalsUnverified);
    expect(row.n).toBe(0);
  });
});
