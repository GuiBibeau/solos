// @ts-check
import { describe, expect, test } from "bun:test";
import { identityOf, releaseIdentity } from "./identity.js";

describe("release identity", () => {
  test("the lane follows the version; the commit is carried as given", () => {
    expect(identityOf("0.0.0", null)).toEqual({ version: "0.0.0", lane: "source", commit: null });
    expect(identityOf("0.1.1-canary.7.g1f232a4", "1f232a4abcdef")).toEqual({
      version: "0.1.1-canary.7.g1f232a4",
      lane: "canary",
      commit: "1f232a4abcdef",
    });
    expect(identityOf("0.1.1", "abc").lane).toBe("stable");
  });

  test("a checkout is source with no commit", () => {
    expect(releaseIdentity()).toEqual({ version: "0.0.0", lane: "source", commit: null });
  });
});
