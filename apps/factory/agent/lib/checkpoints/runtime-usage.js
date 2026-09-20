// @ts-check
import { z } from "zod";

export const RuntimeUsageSchema = z.object({
  accountingScope: z.enum(["station", "root_aggregate"]),
  billedCostSource: z.literal("eve.runtime.provider-reported").optional(),
  billedCostUsd: z.number().nonnegative().optional(),
  billedCostComplete: z.boolean().optional(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  cachedInputTokensComplete: z.boolean().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  inputTokensComplete: z.boolean().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  outputTokensComplete: z.boolean().optional(),
});

/** @param {import("eve/hooks").HookEvent} event */
const eventUsage = (event) => {
  if (event.type === "step.completed") return event.data.usage;
  if (event.type !== "action.result") return undefined;
  const result = event.data.result;
  return result.kind === "subagent-result" && result.origin === "child" ? result.usage : undefined;
};

/** @param {import("eve/hooks").HookEvent} event @param {"station" | "root_aggregate"} scope */
export const usageFromEvent = (event, scope) => {
  const usage = eventUsage(event);
  if (usage === undefined) return undefined;
  return RuntimeUsageSchema.parse({
    accountingScope: scope,
    billedCostComplete: usage.costUsd !== undefined,
    ...(usage.costUsd !== undefined && {
      billedCostSource: "eve.runtime.provider-reported",
      billedCostUsd: usage.costUsd,
    }),
    cachedInputTokens: usage.cacheReadTokens,
    cachedInputTokensComplete: usage.cacheReadTokens !== undefined,
    inputTokens: usage.inputTokens,
    inputTokensComplete: usage.inputTokens !== undefined,
    outputTokens: usage.outputTokens,
    outputTokensComplete: usage.outputTokens !== undefined,
  });
};

/** @typedef {"billedCostUsd" | "cachedInputTokens" | "inputTokens" | "outputTokens"} ValueKey */
/** @typedef {"billedCostComplete" | "cachedInputTokensComplete" | "inputTokensComplete" | "outputTokensComplete"} CompleteKey */

/** @param {RuntimeUsage | undefined} usage @param {FieldKeys} keys @param {boolean} missing */
const known = (usage, { valueKey, completeKey }, missing) => {
  if (usage === undefined) return missing;
  return usage[completeKey] ?? usage[valueKey] !== undefined;
};

/** @param {RuntimeUsage | undefined} usage @param {ValueKey} key */
const value = (usage, key) => usage?.[key] ?? 0;

/** @param {RuntimeUsage | undefined} prior @param {RuntimeUsage} delta @param {FieldKeys} keys */
const fieldState = (prior, delta, keys) => {
  const complete = known(prior, keys, true) && known(delta, keys, false);
  if (!complete) return { complete, value: undefined };
  return { complete, value: value(prior, keys.valueKey) + value(delta, keys.valueKey) };
};

/** @param {RuntimeUsage | undefined} prior @param {RuntimeUsage | undefined} delta */
export const addUsage = (prior, delta) => {
  if (delta === undefined) return prior;
  const billed = fieldState(prior, delta, {
    completeKey: "billedCostComplete",
    valueKey: "billedCostUsd",
  });
  const cached = fieldState(prior, delta, {
    completeKey: "cachedInputTokensComplete",
    valueKey: "cachedInputTokens",
  });
  const input = fieldState(prior, delta, {
    completeKey: "inputTokensComplete",
    valueKey: "inputTokens",
  });
  const output = fieldState(prior, delta, {
    completeKey: "outputTokensComplete",
    valueKey: "outputTokens",
  });
  return RuntimeUsageSchema.parse({
    accountingScope: delta.accountingScope,
    billedCostComplete: billed.complete,
    ...(billed.complete && {
      billedCostSource: "eve.runtime.provider-reported",
    }),
    billedCostUsd: billed.value,
    cachedInputTokens: cached.value,
    cachedInputTokensComplete: cached.complete,
    inputTokens: input.value,
    inputTokensComplete: input.complete,
    outputTokens: output.value,
    outputTokensComplete: output.complete,
  });
};

/** @typedef {z.infer<typeof RuntimeUsageSchema>} RuntimeUsage */
/** @typedef {{completeKey: CompleteKey; valueKey: ValueKey}} FieldKeys */
