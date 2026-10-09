// @ts-check
import { Command, Options } from "@effect/cli";
import { serveStdio } from "@solos/mcp";
import { Effect, Option } from "effect";
import { exitOnFailure } from "../output.js";

const tier = Options.choice("tier", ["read", "simulate", "execute"]).pipe(
  Options.optional,
  Options.withDescription(
    "Tier ceiling: the highest tier of tool this server offers. Beats SOLOS_TOOL_TIER; simulate when neither is set (ADR-0033).",
  ),
);
const tools = Options.choice("tools", ["discover", "all"]).pipe(
  Options.optional,
  Options.withDescription(
    "discover withholds tools until searched for (ADR-0029); all advertises every permitted tool up front. Beats SOLOS_TOOLS.",
  ),
);

const features = Options.choice("features", ["experimental"]).pipe(
  Options.optional,
  Options.withDescription(
    "experimental exposes the tools labelled experimental too, withheld by default (ADR-0036). Beats SOLOS_FEATURES.",
  ),
);

/**
 * `solos mcp serve`: the MCP server over stdio, in the same binary as the CLI, so an installed
 * solos is what an MCP client config runs (ADR-0035). stdout carries JSON-RPC only; the ready
 * line and every log go to stderr. A startup failure prints the usual error envelope and exits 1.
 */
export const serve = Command.make("serve", { tier, tools, features }, (o) =>
  Effect.tryPromise({
    try: () =>
      serveStdio({
        tier: Option.getOrUndefined(o.tier),
        tools: Option.getOrUndefined(o.tools),
        features: Option.getOrUndefined(o.features),
      }),
    catch: (error) => error,
  }).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Serve the MCP server over stdio: the command an MCP client config runs for an installed solos",
  ),
);
