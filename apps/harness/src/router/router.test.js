import { describe, expect, test } from "bun:test";
import { HarnessConfigSchema } from "../config.js";
import { resolveRoute } from "./router.js";

const defaults = HarnessConfigSchema.parse({}).router;

describe("router resolution", () => {
  test("uses the preset and falls back to the other provider", () => {
    expect(resolveRoute("anthropic", defaults, "reasoning")).toEqual({
      taskClass: "reasoning",
      model: "anthropic/claude-fable-5.1",
      fallbacks: ["openai/gpt-6-astra"],
      reasoning: "high",
    });
    expect(resolveRoute("openai", defaults, "fast").model).toBe("openai/gpt-5.6-luna");
    expect(resolveRoute("openai", defaults, "fast").fallbacks).toEqual([
      "anthropic/claude-haiku-4.5",
    ]);
  });

  test("config overrides win and keep explicit fallbacks first", () => {
    const config = HarnessConfigSchema.parse({
      router: {
        overrides: {
          default: {
            model: "openai/gpt-5.6-terra",
            reasoning: "medium",
            fallbacks: ["anthropic/claude-opus-5"],
          },
        },
      },
    }).router;
    expect(resolveRoute("anthropic", config, "default")).toEqual({
      taskClass: "default",
      model: "openai/gpt-5.6-terra",
      fallbacks: ["anthropic/claude-opus-5", "openai/gpt-5.6-sol"],
      reasoning: "medium",
    });
  });

  test("cross-provider fallback can be disabled", () => {
    const config = HarnessConfigSchema.parse({ router: { crossProviderFallback: false } }).router;
    expect(resolveRoute("anthropic", config, "fast").fallbacks).toEqual([]);
  });
});
