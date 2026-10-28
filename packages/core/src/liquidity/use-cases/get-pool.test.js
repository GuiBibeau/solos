// @ts-check
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Option } from "effect";
import { POOL_READ_REASON, POOL_READ_REMEDY } from "../domain/errors.js";
import { getPool } from "./get-pool.js";

const ADDRESS = "11111111111111111111111111111111";

/** @param {import("effect").Effect.Effect<unknown, unknown, unknown>} effect */
const failure = async (effect) => {
  const exit = await Effect.runPromiseExit(effect);
  expect(exit._tag).toBe("Failure");
  const found = Cause.failureOption(exit.cause);
  return Option.isSome(found) ? found.value : undefined;
};

describe("liquidity pool read gates run before any service is required", () => {
  test("orca and raydium fail typed and name the position read", async () => {
    for (const protocol of ["orca", "raydium"]) {
      const error = await failure(getPool({ protocol, pool: ADDRESS }));
      expect(error).toMatchObject({
        _tag: "LiquidityUnsupportedProtocol",
        protocol,
        reason: POOL_READ_REASON,
        remedy: POOL_READ_REMEDY,
      });
    }
  });

  test("an unknown protocol value fails input validation with no service required", async () => {
    const error = await failure(
      getPool({ protocol: /** @type {"orca"} */ ("jupiter"), pool: ADDRESS }),
    );
    expect(error).toMatchObject({ _tag: "LiquidityInputInvalid" });
  });

  test("meteora passes the protocol gate and only then demands the venue", async () => {
    const error = await failure(getPool({ protocol: "meteora", pool: ADDRESS }));
    expect(error).toBeUndefined();
  });
});
