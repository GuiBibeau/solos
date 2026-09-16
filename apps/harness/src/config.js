// @ts-check
import { z } from "zod";

export const TaskClassSchema = z.enum(["fast", "default", "reasoning"]);
/** @typedef {z.infer<typeof TaskClassSchema>} TaskClass */

export const ReasoningSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);

const RouteOverrideSchema = z.object({
  model: z.string().regex(/^[a-z0-9-]+\/[a-z0-9.-]+$/, "gateway id like provider/model"),
  reasoning: ReasoningSchema.optional(),
  fallbacks: z.array(z.string()).optional(),
});

const McpServerEntrySchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

export const HarnessConfigSchema = z.object({
  router: z
    .object({
      overrides: z.partialRecord(TaskClassSchema, RouteOverrideSchema).default({}),
      crossProviderFallback: z.boolean().default(true),
    })
    .default({ overrides: {}, crossProviderFallback: true }),
  agent: z
    .object({ maxSteps: z.number().int().min(1).max(200).default(20) })
    .default({ maxSteps: 20 }),
  daemon: z
    .object({ storePath: z.string().default(".solos/harness.sqlite") })
    .default({ storePath: ".solos/harness.sqlite" }),
  mcpServers: z.array(McpServerEntrySchema).default([]),
});

/** @typedef {z.input<typeof HarnessConfigSchema>} HarnessConfigInput */
/** @typedef {z.output<typeof HarnessConfigSchema>} HarnessConfig */

const HarnessEnvSchema = z.object({
  ROUTER_PRESET: z.enum(["anthropic", "openai"]).default("anthropic"),
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  SOLOS_LOG_LEVEL: z.string().optional(),
});

/** @typedef {z.output<typeof HarnessEnvSchema>} HarnessEnv */

/** @param {Record<string, string | undefined>} env */
export const loadHarnessEnv = (env) => HarnessEnvSchema.parse(env);

/**
 * Non-secret settings from a JS module (default export). Path is absolute or cwd-relative.
 * @param {string} path
 * @returns {Promise<HarnessConfig>}
 */
export const loadHarnessConfig = async (path) => {
  const resolved = path.startsWith("/") ? path : `${process.cwd()}/${path}`;
  const module = /** @type {{ default?: unknown }} */ (await import(resolved));
  return HarnessConfigSchema.parse(module.default ?? {});
};
