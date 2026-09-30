// @ts-check
import { describe, expect, test } from "bun:test";
import { canAdmitExternalTools, INVALID_TIER, tierCeiling } from "./tool-ceiling.js";

describe("tierCeiling", () => {
  test("the flag wins over the environment", () => {
    expect(tierCeiling("execute", { SOLOS_TOOL_TIER: "read" })).toBe("execute");
    expect(tierCeiling("read", {})).toBe("read");
  });

  test("an absent or blank SOLOS_TOOL_TIER means simulate", () => {
    expect(tierCeiling(undefined, {})).toBe("simulate");
    expect(tierCeiling(undefined, { SOLOS_TOOL_TIER: "" })).toBe("simulate");
    expect(tierCeiling(undefined, { SOLOS_TOOL_TIER: "  " })).toBe("simulate");
  });

  test("a configured tier is honoured, and a mistyped one fails instead of widening", () => {
    expect(tierCeiling(undefined, { SOLOS_TOOL_TIER: "read" })).toBe("read");
    expect(tierCeiling(undefined, { SOLOS_TOOL_TIER: " execute " })).toBe("execute");
    expect(() => tierCeiling(undefined, { SOLOS_TOOL_TIER: "raed" })).toThrow(INVALID_TIER);
  });

  test("a bad flag value fails too", () => {
    expect(() => tierCeiling("all", {})).toThrow();
  });
});

describe("canAdmitExternalTools", () => {
  test("third-party tools reach the model only under an execute ceiling", () => {
    expect(canAdmitExternalTools("execute")).toBe(true);
    expect(canAdmitExternalTools("simulate")).toBe(false);
    expect(canAdmitExternalTools("read")).toBe(false);
  });
});
