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
  // Short, and never containing the `__` that separates it from the tool name, so an exposed
  // `<server>__<tool>` splits one way; the whole name stays inside the providers' 64-character
  // tool-name limit.
  name: z
    .string()
    .min(1)
    .max(24)
    .regex(/^[a-z][a-z0-9_-]*$/)
    .refine((name) => !name.includes("__"), "server name must not contain '__'"),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

const HarnessConfigFields = z.object({
  router: z
    .object({
      overrides: z.partialRecord(TaskClassSchema, RouteOverrideSchema).default({}),
      crossProviderFallback: z.boolean().default(true),
    })
    .default({ overrides: {}, crossProviderFallback: true }),
  agent: z
    .object({ maxSteps: z.number().int().min(1).max(200).default(20) })
    .default({ maxSteps: 20 }),
  mcpServers: z.array(McpServerEntrySchema).default([]),
});

/**
 * `daemon` is retired. Other unknown keys stay stripped, which is what `z.object` already did.
 * @param {unknown} value
 * @param {{ addIssue: (issue: { code: "unrecognized_keys"; keys: string[] }) => void }} ctx
 */
const rejectRetiredDaemon = (value, ctx) => {
  if (typeof value === "object" && value !== null && Object.hasOwn(value, "daemon")) {
    ctx.addIssue({ code: "unrecognized_keys", keys: ["daemon"] });
  }
};

export const HarnessConfigSchema = z
  .unknown()
  .superRefine(rejectRetiredDaemon)
  .pipe(HarnessConfigFields);

/** @typedef {z.input<typeof HarnessConfigFields>} HarnessConfigInput */
/** @typedef {z.output<typeof HarnessConfigFields>} HarnessConfig */

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
