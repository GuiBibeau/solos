// @ts-check
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EngineConfigMissing, ValidationError } from "@solos/core";
import {
  modeOf,
  parseAllowedMintsFlag,
  requireToken,
  resolveAllowedMints,
  resolveTier,
} from "./config.js";
import { startEngine } from "./start.js";

const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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

  test("execute without --allowed-mints refuses to start and names the flag", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "engine-mints-"));
    try {
      await startEngine({ env: { SOLOS_ENGINE_TOKEN: "token" }, tier: "execute", dataDir });
      throw new Error("execute engine started without --allowed-mints");
    } catch (error) {
      expect(error).toBeInstanceOf(EngineConfigMissing);
      const missing = /** @type {EngineConfigMissing} */ (error);
      expect(missing.reason).toContain("--allowed-mints");
      expect(missing.remedy).toContain("--allowed-mints any");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("paper and dry without the flag allow any mint; execute keeps an explicit list", () => {
    expect(resolveAllowedMints({ mode: "paper" })).toEqual([]);
    expect(resolveAllowedMints({ mode: "dry" })).toEqual([]);
    expect(resolveAllowedMints({ mode: "live", allowedMints: [] })).toEqual([]);
    expect(resolveAllowedMints({ mode: "live", allowedMints: [WSOL] })).toEqual([WSOL]);
    expect(resolveAllowedMints({ mode: "paper", allowedMints: [USDC] })).toEqual([USDC]);
  });

  test("--allowed-mints any is every mint and a bad list names the remedy", () => {
    expect(parseAllowedMintsFlag("any")).toEqual([]);
    expect(parseAllowedMintsFlag("  any  ")).toEqual([]);
    expect(parseAllowedMintsFlag(`${WSOL},${USDC}`)).toEqual([WSOL, USDC]);
    expect(() => parseAllowedMintsFlag("nope")).toThrow(ValidationError);
    try {
      parseAllowedMintsFlag("nope");
    } catch (error) {
      const invalid = /** @type {ValidationError} */ (error);
      expect(invalid.field).toBe("allowed-mints");
      expect(invalid.value).toBeNull();
      expect(invalid.remedy).toContain("--allowed-mints any");
    }
  });
});
