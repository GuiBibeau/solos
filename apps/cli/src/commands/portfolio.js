// @ts-check
import { Command, Options } from "@effect/cli";
import { getState, getStateTool } from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

const owner = Options.text("owner").pipe(
  Options.optional,
  optionHelp(getStateTool.input.shape.owner),
);

const state = Command.make("state", { owner }, (options) =>
  withSolos(
    getState({ owner: Option.getOrUndefined(options.owner) }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(getStateTool));

export const portfolio = Command.make("portfolio").pipe(
  groupHelp("Supported-portfolio read model: cash, positions and perp equity"),
  Command.withSubcommands([state]),
);
