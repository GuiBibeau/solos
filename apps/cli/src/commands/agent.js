// @ts-check
import { Args, Command, Options } from "@effect/cli";
import { allTools } from "@solos/core";
import {
  Router,
  TierSchema,
  canAdmitExternalTools,
  callSettingsFor,
  createSolosAgent,
  discoverMcpTools,
  groupIndex,
  loadHarness,
  makeHarnessRuntime,
  tierCeiling,
  toolsFromDefinitions,
} from "@solos/harness";
import { filterByTier } from "@solos/mcp";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";

const task = Args.text({ name: "task" });
/**
 * The same ceiling the MCP server applies (ADR-0029, ADR-0033): simulate by default, so a
 * prompt-injected turn cannot reach a tool that signs and sends unless the Operator raised it.
 * `SOLOS_TOOL_TIER` is honoured for parity with the server; the flag wins. Third-party MCP tools
 * carry no tier and are admitted only under `execute`.
 */
const tier = Options.choice("tier", TierSchema.options).pipe(
  Options.optional,
  Options.withDescription(
    "Highest tool tier the model may call: read, simulate (default) or execute",
  ),
);
const groups = Options.text("groups").pipe(
  Options.optional,
  Options.withDescription("Comma-separated tool groups to expose, e.g. wallet,transfer"),
);
const taskClass = Options.choice("class", ["fast", "default", "reasoning"]).pipe(
  Options.withDefault("default"),
);

/**
 * @param {ReturnType<typeof makeHarnessRuntime>} runtime
 * @param {"fast" | "default" | "reasoning"} taskClass
 */
const resolveRouteFor = (runtime, taskClass) =>
  Effect.promise(() => runtime.runPromise(Effect.map(Router, (r) => r.resolve(taskClass))));

/** @param {ReadonlyArray<{ toolCalls: ReadonlyArray<{ toolName: string; input: unknown }> }>} steps */
const summarizeToolCalls = (steps) =>
  steps.flatMap((s) => s.toolCalls.map((c) => ({ tool: c.toolName, input: c.input })));

/** No servers are started when the ceiling withholds their tools. */
const NO_EXTERNAL = { tools: {}, groups: {}, close: async () => {} };

/**
 * @param {import("effect").Option.Option<"read" | "simulate" | "execute">} flag
 * @returns {import("effect").Effect.Effect<import("@solos/harness").Tier, Error>}
 */
const ceilingOf = (flag) =>
  Effect.try({
    try: () => tierCeiling(flag._tag === "Some" ? flag.value : undefined, process.env),
    catch: (error) => /** @type {Error} */ (error),
  });

/**
 * One agent-loop run with our tools plus any configured third-party MCP servers.
 * Needs AI_GATEWAY_API_KEY. With `--tier execute` the execute tools are live: on mainnet this
 * spends real funds.
 */
const run = Command.make("run", { task, groups, taskClass, tier }, (o) =>
  Effect.gen(function* () {
    const ceiling = yield* ceilingOf(o.tier);
    const { layer, config } = yield* Effect.tryPromise({
      try: () => loadHarness({ toolCeiling: ceiling }),
      catch: (error) => error,
    });
    const offered = filterByTier(allTools, ceiling);
    const runtime = makeHarnessRuntime(layer);
    const external = canAdmitExternalTools(ceiling)
      ? yield* Effect.promise(() => discoverMcpTools(config.mcpServers))
      : NO_EXTERNAL;
    const route = yield* resolveRouteFor(runtime, o.taskClass);
    const settings = callSettingsFor(route);
    const agent = createSolosAgent({
      model: settings.model,
      tools: { ...toolsFromDefinitions(offered, runtime), ...external.tools },
      groups: { ...groupIndex(offered), ...external.groups },
      definitions: offered,
      maxSteps: config.agent.maxSteps,
      activeGroups: o.groups._tag === "Some" ? o.groups.value.split(",") : undefined,
      reasoning: settings.reasoning,
      providerOptions: settings.providerOptions,
    });
    const result = yield* Effect.promise(() => agent.generate({ prompt: o.task })).pipe(
      Effect.ensuring(Effect.promise(() => external.close())),
      Effect.ensuring(Effect.promise(() => runtime.dispose())),
    );
    yield* emit({
      route,
      tier: ceiling,
      externalServers: {
        configured: config.mcpServers.length,
        admitted: canAdmitExternalTools(ceiling) ? config.mcpServers.length : 0,
      },
      text: result.text,
      steps: result.steps.length,
      toolCalls: summarizeToolCalls(result.steps),
    });
  }).pipe(exitOnFailure),
).pipe(Command.withDescription("Run one agent-loop turn over the discovered tools"));

export const agent = Command.make("agent").pipe(
  Command.withDescription("Harness agent loop"),
  Command.withSubcommands([run]),
);
