// @ts-check
/**
 * A plan refusal becomes `BuildRejected` with the remedy only when one was given.
 */
import { describe, expect, test } from "bun:test";
import { BuildRejected } from "@solos/core";
import { planRejected } from "./plan-rejected.js";

describe("plan refusal", () => {
  test("a remedy sits beside the reason", () => {
    const error = planRejected({
      reason: "the pool's mint has a token-2022 transfer hook",
      remedy: "use a pool whose mints have no transfer-hook program",
    });
    expect(error).toBeInstanceOf(BuildRejected);
    expect(error.reason).toContain("transfer hook");
    expect(error.remedy).toBe("use a pool whose mints have no transfer-hook program");
  });

  test("a refusal without a remedy does not invent one", () => {
    const error = planRejected({ reason: "the pair reserves are missing" });
    expect(error.reason).toContain("reserves");
    expect(error.remedy).toBeUndefined();
  });
});
