// @ts-check
import { describe, expect, test } from "bun:test";
import { EngineConfigMissing } from "@solos/core";
import { modeOf, requireToken, resolveTier } from "./config.js";

describe("engine start flags", () => {
  test("the tier flag wins over SOLOS_TOOL_TIER, which wins over the default", () => {
    expect(resolveTier({ paper: false, env: {} })).toBe("simulate");
    expect(resolveTier({ paper: false, env: { SOLOS_TOOL_TIER: "read" } })).toBe("read");
    expect(
      resolveTier({ tier: "simulate", paper: false, env: { SOLOS_TOOL_TIER: "execute" } }),
    ).toBe("simulate");
  });

  test("paper implies execute only when --tier was omitted", () => {
    expect(resolveTier({ paper: true, env: { SOLOS_TOOL_TIER: "read" } })).toBe("execute");
    expect(resolveTier({ tier: "read", paper: true, env: {} })).toBe("read");
    expect(modeOf(true, "execute")).toBe("paper");
    expect(modeOf(false, "execute")).toBe("live");
    expect(modeOf(false, "simulate")).toBe("dry");
  });

  test("a missing token is EngineConfigMissing and names the variable", () => {
    expect(() => requireToken({})).toThrow(EngineConfigMissing);
    try {
      requireToken({});
    } catch (error) {
      expect(/** @type {EngineConfigMissing} */ (error).reason).toContain("SOLOS_ENGINE_TOKEN");
      expect(/** @type {EngineConfigMissing} */ (error).remedy).toContain("SOLOS_ENGINE_TOKEN");
    }
  });

  test("a blank SOLOS_TOOL_TIER means simulate", () => {
    expect(resolveTier({ paper: false, env: { SOLOS_TOOL_TIER: "" } })).toBe("simulate");
  });
});
