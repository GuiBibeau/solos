// @ts-check
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Option } from "effect";
import { LiquidityInputInvalid, LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { getLpPosition } from "./get-position.js";
import { listLpPositions } from "./list-positions.js";

const ADDRESS = "11111111111111111111111111111111";

/**
 * The use cases demand no service before their gates: run with an empty environment, a
 * rejected protocol must fail with the typed error, never with "Service not found" (which
 * would mean the Signer or the venue port was demanded first) and never with a network call.
 * @param {Effect.Effect<unknown, unknown, unknown>} effect
 */
const failureTag = async (effect) => {
  const exit = await Effect.runPromiseExit(effect);
  expect(exit._tag).toBe("Failure");
  const failure = Cause.failureOption(exit.cause);
  expect(Option.isSome(failure)).toBe(true);
  return Option.getOrThrow(failure)?._tag;
};

describe("liquidity use-case gates run before any service is required", () => {
  test("meteora fails the protocol gate before the Signer or venue port", async () => {
    const input = { protocol: /** @type {"orca"} */ ("meteora"), position: ADDRESS };
    expect(await failureTag(getLpPosition(input))).toBe("LiquidityUnsupportedProtocol");
    expect(await failureTag(listLpPositions(input))).toBe("LiquidityUnsupportedProtocol");
  });

  test("an unknown protocol value fails input validation with no service required", async () => {
    const input = { protocol: /** @type {"orca"} */ ("jupiter"), position: ADDRESS };
    const tag = await failureTag(getLpPosition(input));
    expect(tag).toBe("LiquidityInputInvalid");
    expect(await failureTag(listLpPositions(input))).toBe("LiquidityInputInvalid");
  });

  test("the typed errors are the slice's own classes", () => {
    expect(new LiquidityInputInvalid({ reason: "x" })._tag).toBe("LiquidityInputInvalid");
    expect(new LiquidityUnsupportedProtocol({ protocol: "meteora" })._tag).toBe(
      "LiquidityUnsupportedProtocol",
    );
  });
});
