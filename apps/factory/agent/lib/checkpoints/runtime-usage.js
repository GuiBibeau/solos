// @ts-check
import { z } from "zod";

export const RuntimeUsageSchema = z.object({
  accountingScope: z.enum(["station", "root_aggregate"]),
  billedCostSource: z.literal("eve.runtime.provider-reported").optional(),
  billedCostUsd: z.number().nonnegative().optional(),
  billedCostComplete: z.boolean().optional(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
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
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
};

/** @param {RuntimeUsage | undefined} prior @param {RuntimeUsage | undefined} delta */
export const addUsage = (prior, delta) => {
  if (delta === undefined) return prior;
  /** @param {keyof Pick<RuntimeUsage, "billedCostUsd" | "cachedInputTokens" | "inputTokens" | "outputTokens">} key */
  const add = (key) =>
    prior?.[key] === undefined && delta[key] === undefined
      ? undefined
      : (prior?.[key] ?? 0) + (delta[key] ?? 0);
  const priorCostComplete =
    prior === undefined ? true : (prior.billedCostComplete ?? prior.billedCostUsd !== undefined);
  const deltaCostComplete = delta.billedCostComplete ?? delta.billedCostUsd !== undefined;
  const billedCostComplete = priorCostComplete && deltaCostComplete;
  return RuntimeUsageSchema.parse({
    accountingScope: delta.accountingScope,
    billedCostComplete,
    ...(billedCostComplete && { billedCostSource: "eve.runtime.provider-reported" }),
    ...(billedCostComplete && { billedCostUsd: add("billedCostUsd") }),
    cachedInputTokens: add("cachedInputTokens"),
    inputTokens: add("inputTokens"),
    outputTokens: add("outputTokens"),
  });
};

/** @typedef {z.infer<typeof RuntimeUsageSchema>} RuntimeUsage */
