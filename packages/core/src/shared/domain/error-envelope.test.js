// @ts-check
import { describe, expect, test } from "bun:test";
import { errorEnvelope } from "./error-envelope.js";
import { BoundsExceeded, BuildRejected, TransactionFailed } from "./errors.js";

const REMEDY = "pass wrapSol: true to wrap native SOL for this side";

describe("domain error envelope", () => {
  test("carries the tag as code and the structured props beside it", () => {
    expect(errorEnvelope(new BuildRejected({ reason: "policy failed" }))).toEqual({
      code: "BuildRejected",
      reason: "policy failed",
    });
  });

  test("carries a remedy next to the reason when the error names one", () => {
    const error = new BuildRejected({
      reason: "the funding account does not exist",
      remedy: REMEDY,
    });
    expect(errorEnvelope(error)).toEqual({
      code: "BuildRejected",
      reason: "the funding account does not exist",
      remedy: REMEDY,
    });
  });

  test("omits remedy entirely when none was given, never inventing one", () => {
    const envelope = errorEnvelope(
      new TransactionFailed({ signature: null, reason: "confirmation was not established" }),
    );
    expect(envelope).toEqual({
      code: "TransactionFailed",
      signature: null,
      reason: "confirmation was not established",
    });
    expect("remedy" in (envelope ?? {})).toBe(false);
  });

  test("BoundsExceeded names the bound, its limit, the request and the scope", () => {
    expect(
      errorEnvelope(
        new BoundsExceeded({
          bound: "maxDailySpendUsd",
          limit: "5",
          requested: "3",
          scope: "engine",
          remedy: "raise maxDailySpendUsd or wait until the next UTC day",
        }),
      ),
    ).toEqual({
      code: "BoundsExceeded",
      bound: "maxDailySpendUsd",
      limit: "5",
      requested: "3",
      scope: "engine",
      reason: "maxDailySpendUsd limit is 5 on scope engine; requested 3",
      remedy: "raise maxDailySpendUsd or wait until the next UTC day",
    });
  });

  test("returns undefined for anything that is not a tagged domain error", () => {
    expect(errorEnvelope(new Error("boom"))).toBeUndefined();
    expect(errorEnvelope("boom")).toBeUndefined();
    expect(errorEnvelope(null)).toBeUndefined();
  });

  test("never emits a stack trace or an absolute filesystem path", () => {
    const text = JSON.stringify(errorEnvelope(new BuildRejected({ reason: "x" })));
    expect(text).not.toContain("    at ");
    expect(text).not.toContain("/Users/");
  });
});
