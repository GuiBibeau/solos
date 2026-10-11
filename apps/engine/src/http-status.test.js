// @ts-check
import { describe, expect, test } from "bun:test";
import { statusFor } from "./http.js";

describe("strategy error statuses", () => {
  test("an unsupported scheduled action is 400 and unverified decimals are 503", () => {
    expect(statusFor("UnsupportedStrategyAction")).toBe(400);
    expect(statusFor("MintDecimalsUnverified")).toBe(503);
  });
});
