// @ts-check
import { describe, expect, test } from "bun:test";
import { serverEntry } from "./entry.js";

describe("the solos MCP entry", () => {
  test("carries the feature flag as SOLOS_FEATURES and the profile, and nothing else, in env", () => {
    expect(serverEntry().env).toEqual({});
    expect(serverEntry({ profile: "ops" }).env).toEqual({ SOLOS_PROFILE: "ops" });
    expect(serverEntry({ features: "experimental", profile: "ops" }).env).toEqual({
      SOLOS_PROFILE: "ops",
      SOLOS_FEATURES: "experimental",
    });
  });

  test("the ceiling and discovery choices travel as flags", () => {
    const entry = serverEntry({ tier: "execute", tools: "all" });
    expect(entry.args.slice(-4)).toEqual(["--tier", "execute", "--tools", "all"]);
  });
});
