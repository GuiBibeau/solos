// @ts-check
import { Args, Command, Options } from "@effect/cli";
import { SEARCH_TOOL, connectMcp, solosServerCommand } from "@solos/mcp";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { serve } from "./mcp-serve.js";

/** Exactly what a real MCP client would pass: network, signer or profile selection, logging, tier. */
const FORWARDED_ENV = [
  "SOLANA_RPC_URL",
  "SOLANA_WS_URL",
  "SOLOS_SIGNER_PRIVATE_KEY",
  "SOLOS_SIGNER_KEYPAIR_PATH",
  "SOLOS_PROFILE",
  "SOLOS_CONFIG_DIR",
  "SOLOS_LOG_LEVEL",
  "SOLOS_TOOL_TIER",
  "SOLOS_TOOLS",
  "SOLOS_FEATURES",
  // Market intelligence (Elfa Iris): key + optional base URL override for fixtures.
  "ELFA_API_KEY",
  "ELFA_BASE_URL",
  // Jupiter prices: key + optional base URL override for fixtures.
  "JUPITER_API_KEY",
  "JUPITER_BASE_URL",
  // Phoenix Perps fixture and approved venue endpoint.
  "PHOENIX_BASE_URL",
  // Kamino reserve reads: optional configured market (RPC is shared above).
  "KAMINO_LENDING_MARKET",
  // Free-text tool discovery through JEV: key + optional base URL override for fixtures.
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_BASE_URL",
];

/**
 * Spawn our own server exactly as an external client would, forwarding only known env keys plus
 * what the command itself sets.
 * @param {Record<string, string>} [overrides]
 */
const connectWith = (overrides = {}) =>
  Effect.acquireRelease(
    Effect.promise(() =>
      connectMcp({
        ...solosServerCommand(),
        env: {
          ...Object.fromEntries(
            FORWARDED_ENV.filter((key) => process.env[key] !== undefined).map((key) => [
              key,
              /** @type {string} */ (process.env[key]),
            ]),
          ),
          ...overrides,
        },
        stderr: "ignore",
      }),
    ),
    (mcp) => Effect.promise(() => mcp.close()),
  );
const connect = connectWith();

const features = Options.choice("features", ["experimental"]).pipe(
  Options.optional,
  Options.withDescription(
    "experimental lists the tools labelled experimental too, which the server withholds by default (ADR-0036)",
  ),
);

/** The label the server stamps on a tool (ADR-0036). @param {unknown} meta */
const stabilityOf = (meta) =>
  /** @type {Record<string, unknown> | undefined} */ (meta)?.["solos/stability"];

const list = Command.make("list", { features }, (o) =>
  Effect.gen(function* () {
    const flag = Option.getOrUndefined(o.features);
    const mcp = yield* connectWith(flag === undefined ? {} : { SOLOS_FEATURES: flag });
    const tools = yield* Effect.promise(() => mcp.listTools());
    yield* emit({
      server: mcp.serverInfo,
      instructions: mcp.instructions,
      tools: tools.map((t) => ({
        name: t.name,
        title: t.title,
        stability: stabilityOf(t._meta),
        annotations: t.annotations,
        meta: t._meta,
      })),
    });
  }).pipe(Effect.scoped, exitOnFailure),
).pipe(
  Command.withDescription(
    "Spawn the solos MCP server over stdio and list its tools with their stability labels",
  ),
);

const toolName = Args.text({ name: "tool" }).pipe(
  Args.withDescription("Tool name, e.g. solana_wallet_get_balance"),
);
const args = Options.text("args").pipe(
  Options.withDefault("{}"),
  Options.withDescription("JSON object of tool arguments"),
);

/**
 * A Caller's first move when a tool is not advertised: ask for it by name (ADR-0029). The
 * server enables it when the ceiling permits; otherwise the search result says why, and that
 * result is the answer.
 * @param {Awaited<ReturnType<typeof connectMcp>>} mcp
 * @param {string} toolName
 */
const discover = (mcp, toolName) =>
  Effect.promise(async () => {
    const advertised = (await mcp.listTools()).some((tool) => tool.name === toolName);
    if (advertised) return undefined;
    const found = await mcp.callTool(SEARCH_TOOL, { names: [toolName] });
    const { matches = [] } =
      /** @type {{ matches?: Array<{ name: string; available: boolean }> }} */ (
        found.structuredContent ?? {}
      );
    return matches.some((match) => match.name === toolName && match.available) ? undefined : found;
  });

const call = Command.make("call", { toolName, args }, (options) =>
  Effect.gen(function* () {
    const mcp = yield* connect;
    const refused = yield* discover(mcp, options.toolName);
    if (refused !== undefined) {
      yield* emit({ ...refused, isError: true });
      process.exitCode = 1;
      return;
    }
    const parsed = /** @type {Record<string, unknown>} */ (JSON.parse(options.args));
    const timeout = options.toolName === "solana_market_get_event_summary" ? 190_000 : undefined;
    const result = yield* Effect.promise(() => mcp.callTool(options.toolName, parsed, { timeout }));
    yield* emit(result);
    if (result.isError) process.exitCode = 1;
  }).pipe(Effect.scoped, exitOnFailure),
).pipe(Command.withDescription("Call a tool through the real MCP client, black-box"));

export const mcp = Command.make("mcp").pipe(
  Command.withDescription("Exercise the MCP server as a client would"),
  Command.withSubcommands([serve, list, call]),
);
