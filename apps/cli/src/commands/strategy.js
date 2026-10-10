// @ts-check
import { readFileSync } from "node:fs";
import { Args, Command, Options } from "@effect/cli";
import {
  EngineConfigMissing,
  executeRegisterTool,
  executeUpdateTool,
  getStatusTool,
  getStrategyStatus,
  listStrategies,
  listStrategiesTool,
  registerStrategy,
  StrategyInvalid,
  updateStrategy,
} from "@solos/core";
import { HttpStrategyRegistry } from "@solos/solana";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

/** @returns {import("effect").Effect.Effect<{ url: string; token: string }, EngineConfigMissing>} */
const endpoint = () => {
  const url = process.env.SOLOS_ENGINE_URL;
  if (url === undefined || url.length === 0) {
    return Effect.fail(
      new EngineConfigMissing({
        reason: "SOLOS_ENGINE_URL is not set",
        remedy: "export SOLOS_ENGINE_URL",
      }),
    );
  }
  const token = process.env.SOLOS_ENGINE_TOKEN;
  if (token === undefined || token.length === 0) {
    return Effect.fail(
      new EngineConfigMissing({
        reason: "SOLOS_ENGINE_TOKEN is not set",
        remedy: "export SOLOS_ENGINE_TOKEN",
      }),
    );
  }
  return Effect.succeed({ url, token });
};

/** @param {import("effect").Effect.Effect<unknown, unknown, import("@solos/core/strategy").StrategyRegistryShape>} effect */
const run = (effect) =>
  endpoint().pipe(
    Effect.flatMap((engine) => effect.pipe(Effect.provide(HttpStrategyRegistry(engine)))),
    Effect.flatMap(emit),
    exitOnFailure,
  );

/** @param {string} file */
const readDraft = (file) => {
  try {
    return Effect.succeed(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return Effect.fail(new StrategyInvalid({ reason: "strategy file is not JSON" }));
  }
};

const file = Options.text("file");
const state = Options.choice("state", ["active", "paused", "done", "expired", "failed"]).pipe(
  Options.optional,
  optionHelp(listStrategiesTool.input.shape.state),
);
const owner = Options.text("owner").pipe(
  Options.optional,
  optionHelp(listStrategiesTool.input.shape.owner),
);
const idArg = () => Args.text({ name: "id" });

const register = Command.make("register", { file }, (options) =>
  run(readDraft(options.file).pipe(Effect.flatMap(registerStrategy))),
).pipe(commandHelp(executeRegisterTool));

const list = Command.make("list", { state, owner }, (options) =>
  run(
    listStrategies({
      state: Option.getOrUndefined(options.state),
      owner: Option.getOrUndefined(options.owner),
    }),
  ),
).pipe(commandHelp(listStrategiesTool));

const status = Command.make("status", { id: idArg() }, (options) =>
  run(getStrategyStatus(options.id)),
).pipe(commandHelp(getStatusTool));

/**
 * Pause, resume, and cancel are three verbs over the one update tool.
 * @param {string} name
 * @param {"active" | "paused" | "done"} next
 */
const move = (name, next) =>
  Command.make(name, { id: idArg() }, (options) => run(updateStrategy(options.id, next))).pipe(
    commandHelp(executeUpdateTool),
  );

export const strategy = Command.make("strategy").pipe(
  groupHelp("Register and manage strategies on the Engine"),
  Command.withSubcommands([
    register,
    list,
    status,
    move("pause", "paused"),
    move("resume", "active"),
    move("cancel", "done"),
  ]),
);
