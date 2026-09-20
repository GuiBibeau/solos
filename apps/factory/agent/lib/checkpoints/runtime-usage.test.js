// @ts-check
import { expect, test } from "bun:test";
import { addUsage, RuntimeUsageSchema } from "./runtime-usage.js";

/** @param {Record<string, unknown>} values */
const usage = (values) => RuntimeUsageSchema.parse({ accountingScope: "station", ...values });

test("cumulative usage keeps partially unavailable token fields unavailable", () => {
  const first = usage({
    cachedInputTokensComplete: false,
    inputTokens: 10,
    inputTokensComplete: true,
    outputTokens: 2,
    outputTokensComplete: true,
  });
  const second = usage({
    cachedInputTokens: 3,
    cachedInputTokensComplete: true,
    inputTokens: 5,
    inputTokensComplete: true,
    outputTokens: 1,
    outputTokensComplete: true,
  });
  expect(addUsage(first, second)).toMatchObject({
    cachedInputTokensComplete: false,
    inputTokens: 15,
    outputTokens: 3,
  });
  expect(JSON.stringify(addUsage(first, second))).not.toContain('cachedInputTokens":');
});
