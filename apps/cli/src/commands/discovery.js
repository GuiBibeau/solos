// @ts-check
import { Command, Options } from "@effect/cli";
import { DEFAULT_SELECTION_LIMIT, allTools, selectTools } from "@solos/core";
import { JevToolSelectorLive, loadGatewayEnv } from "@solos/solana";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";

const query = Options.text("query").pipe(
  Options.withDescription('The request in the Caller\'s own words, e.g. "swap SOL for USDC"'),
);
const limit = Options.integer("limit").pipe(
  Options.withDefault(DEFAULT_SELECTION_LIMIT),
  Options.withDescription("How many matches to list; the rest are only counted"),
);

/** Needs no RPC URL or signer: selection reads the tool registry and, with a key, the gateway. */
const select = Command.make("select", { query, limit }, (options) =>
  Effect.suspend(() =>
    selectTools({ query: options.query, tools: allTools, limit: options.limit }).pipe(
      Effect.provide(JevToolSelectorLive(loadGatewayEnv(process.env))),
    ),
  ).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Rank every tool against a free-text request: JEV through Vercel AI Gateway when AI_GATEWAY_API_KEY is set, the local matcher otherwise",
  ),
);

export const discovery = Command.make("discovery").pipe(
  Command.withDescription("Tool discovery: which tools a free-text request should surface"),
  Command.withSubcommands([select]),
);
