// @ts-check
import { Args, Command, Options } from "@effect/cli";
import { allTools } from "@solos/core";
import {
  Router,
  callSettingsFor,
  createSolosAgent,
  discoverMcpTools,
  groupIndex,
  loadHarness,
  makeHarnessRuntime,
  toolsFromDefinitions,
} from "@solos/harness";
import { filterByTier } from "@solos/mcp";
import { Effect } from "effect";
import { z } from "zod";
import { emit, exitOnFailure } from "../output.js";

const TierSchema = z.enum(["read", "simulate", "execute"]);

const task = Args.text({ name: "task" });
/**
 * The same ceiling the MCP server applies (ADR-0029, ADR-0033): simulate by default, so a
 * prompt-injected turn cannot reach a tool that signs and sends unless the Operator raised it.
 * `SOLOS_TOOL_TIER` is honoured for parity with the server; the flag wins.
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

/** @param {import("effect").Option.Option<"read" | "simulate" | "execute">} flag */
const ceilingOf = (flag) =>
  flag._tag === "Some"
    ? flag.value
    : TierSchema.catch("simulate").parse(process.env.SOLOS_TOOL_TIER || undefined);

/**
 * One agent-loop run with our tools plus any configured third-party MCP servers.
 * Needs AI_GATEWAY_API_KEY. With `--tier execute` the execute tools are live: on mainnet this
 * spends real funds.
 */
const run = Command.make("run", { task, groups, taskClass, tier }, (o) =>
  Effect.gen(function* () {
    const { layer, config } = yield* Effect.tryPromise({
      try: () => loadHarness(),
      catch: (error) => error,
    });
    const offered = filterByTier(allTools, ceilingOf(o.tier));
    const runtime = makeHarnessRuntime(layer);
    const external = yield* Effect.promise(() => discoverMcpTools(config.mcpServers));
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
