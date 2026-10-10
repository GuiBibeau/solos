// @ts-check
import { Command, Options } from "@effect/cli";
import { DEFAULT_SELECTION_LIMIT, allTools, searchToolsTool, selectTools } from "@solos/core";
import { JevToolSelectorLive, loadGatewayEnv } from "@solos/solana";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

const query = Options.text("query").pipe(optionHelp(searchToolsTool.input.shape.query));
const limit = Options.integer("limit").pipe(
  Options.withDefault(DEFAULT_SELECTION_LIMIT),
  optionHelp(searchToolsTool.input.shape.limit),
);

/** Needs no RPC URL or signer: selection reads the tool registry and, with a key, the gateway. */
const select = Command.make("select", { query, limit }, (options) =>
  Effect.suspend(() =>
    selectTools({ query: options.query, tools: allTools, limit: options.limit }).pipe(
      Effect.provide(JevToolSelectorLive(loadGatewayEnv(process.env))),
    ),
  ).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(commandHelp(searchToolsTool));

export const discovery = Command.make("discovery").pipe(
  groupHelp("Tool discovery: which tools a free-text request should surface"),
  Command.withSubcommands([select]),
);
