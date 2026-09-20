// @ts-check
import { expect, test } from "bun:test";
import { checkoutBranchInputSchema } from "./branch-tools.js";
import { stationVerificationInputSchema } from "./station-verification.js";

const SHA = "a".repeat(40);
/** @param {unknown} input */
const parseVerification = (input) => stationVerificationInputSchema.safeParse(input).success;

test("revision checkout requires its immutable remote head", () => {
  expect(checkoutBranchInputSchema().safeParse({ branch: "factory/test" }).success).toBe(false);
  expect(
    checkoutBranchInputSchema().safeParse({ branch: "factory/test", expectedHead: SHA }).success,
  ).toBe(true);
});

test("station verification pairs revision branch and remote ownership head", () => {
  expect(parseVerification({ expectedHead: SHA, scope: "unit" })).toBe(true);
  expect(parseVerification({ branch: "factory/test", scope: "unit" })).toBe(false);
  expect(parseVerification({ expectedRemoteHead: SHA, scope: "unit" })).toBe(false);
  expect(
    parseVerification({
      branch: "factory/test",
      expectedHead: SHA,
      expectedRemoteHead: SHA,
      scope: "unit",
    }),
  ).toBe(true);
});
