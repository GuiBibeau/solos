// @ts-check
import { describe, expect, test } from "bun:test";
import { HarnessConfigSchema } from "./config.js";

/** The `daemon` block is retired: a config that still carries it fails, naming the field. */
describe("harness config", () => {
  test("an empty config resolves to the documented defaults, with no daemon block", () => {
    const config = HarnessConfigSchema.parse({});
    expect(Object.keys(config)).toEqual(["router", "agent", "mcpServers"]);
    expect("daemon" in config).toBe(false);
    expect(config.agent.maxSteps).toBe(20);
    expect(config.router.crossProviderFallback).toBe(true);
  });

  test("a config that still carries a daemon block fails validation naming the field", () => {
    const result = HarnessConfigSchema.safeParse({
      daemon: { storePath: ".solos/harness.sqlite" },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    // Only the retired key is reported; the issue and the message name it.
    expect(result.error.issues).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["daemon"] }),
    ]);
    expect(result.error.message).toContain('"daemon"');
  });

  test("another unknown key is stripped, as this object did before", () => {
    const config = HarnessConfigSchema.parse({ notAField: true, agent: { maxSteps: 7 } });
    expect(config).not.toHaveProperty("notAField");
    expect(config.agent.maxSteps).toBe(7);
    expect(Object.keys(config)).toEqual(["router", "agent", "mcpServers"]);
  });

  test("the repo's harness.config.js carries no daemon block and validates", async () => {
    const module = await import("../../../harness.config.js");
    expect(module.default).not.toHaveProperty("daemon");
    expect(() => HarnessConfigSchema.parse(module.default)).not.toThrow();
  });
});
