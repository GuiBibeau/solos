// @ts-check
import { describe, expect, test } from "bun:test";
import {
  INVALID_FEATURES,
  INVALID_TIER,
  canAdmitExternalTools,
  featureFlags,
  tierCeiling,
} from "./tool-ceiling.js";

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

  test("experimental tools are withheld unless the flag or SOLOS_FEATURES enables them (ADR-0036)", () => {
    expect(featureFlags(undefined, {})).toEqual({ experimental: false });
    expect(featureFlags(undefined, { SOLOS_FEATURES: " " })).toEqual({ experimental: false });
    expect(featureFlags(undefined, { SOLOS_FEATURES: "experimental" })).toEqual({
      experimental: true,
    });
    expect(featureFlags("experimental", {})).toEqual({ experimental: true });
    expect(() => featureFlags(undefined, { SOLOS_FEATURES: "beta" })).toThrow(INVALID_FEATURES);
    expect(() => featureFlags("all", { SOLOS_FEATURES: "experimental" })).toThrow(INVALID_FEATURES);
  });
});
