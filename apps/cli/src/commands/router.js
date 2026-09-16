// @ts-check
import { Command, Options } from "@effect/cli";
import { callSettingsFor, loadHarnessConfig, loadHarnessEnv, resolveRoute } from "@solos/harness";
import { generateText } from "ai";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";

const taskClass = Options.choice("class", ["fast", "default", "reasoning"]).pipe(
  Options.withDefault("default"),
);
const prompt = Options.text("prompt").pipe(
  Options.optional,
  Options.withDescription("When given and AI_GATEWAY_API_KEY is set, make one real call"),
);

const route = Command.make("route", { taskClass, prompt }, (o) =>
  Effect.gen(function* () {
    const env = loadHarnessEnv(process.env);
    const config = yield* Effect.promise(() =>
      loadHarnessConfig(process.env.SOLOS_CONFIG ?? "harness.config.js"),
    );
    const resolved = resolveRoute(env.ROUTER_PRESET, config.router, o.taskClass);
    if (o.prompt._tag === "None" || !env.AI_GATEWAY_API_KEY) {
      return yield* emit({ preset: env.ROUTER_PRESET, route: resolved, called: false });
    }
    const settings = callSettingsFor(resolved);
    const result = yield* Effect.promise(() =>
      generateText({
        ...settings,
        prompt: /** @type {string} */ (o.prompt._tag === "Some" ? o.prompt.value : ""),
      }),
    );
    const gateway = /** @type {{ modelAttempts?: unknown } | undefined} */ (
      result.providerMetadata?.gateway
    );
    yield* emit({
      preset: env.ROUTER_PRESET,
      route: resolved,
      called: true,
      text: result.text,
      attempts: gateway?.modelAttempts,
    });
  }).pipe(exitOnFailure),
).pipe(Command.withDescription("Resolve a task class to a model, optionally making one call"));

export const router = Command.make("router").pipe(
  Command.withDescription("Model routing"),
  Command.withSubcommands([route]),
);
