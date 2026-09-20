// @ts-check
import { Args, Command, Options } from "@effect/cli";
import { connectMcp, solosServerCommand } from "@solos/mcp";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";

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
  // Market intelligence (Elfa Iris): key + optional base URL override for fixtures.
  "ELFA_API_KEY",
  "ELFA_BASE_URL",
  // Jupiter prices: key + optional base URL override for fixtures.
  "JUPITER_API_KEY",
  "JUPITER_BASE_URL",
  // Kamino reserve reads: optional configured market (RPC is shared above).
  "KAMINO_LENDING_MARKET",
];

/** Spawn our own server exactly as an external client would, forwarding only known env keys. */
const connect = Effect.acquireRelease(
  Effect.promise(() =>
    connectMcp({
      ...solosServerCommand(),
      env: Object.fromEntries(
        FORWARDED_ENV.filter((key) => process.env[key] !== undefined).map((key) => [
          key,
          /** @type {string} */ (process.env[key]),
        ]),
      ),
      stderr: "ignore",
    }),
  ),
  (mcp) => Effect.promise(() => mcp.close()),
);

const list = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const mcp = yield* connect;
    const tools = yield* Effect.promise(() => mcp.listTools());
    yield* emit({
      server: mcp.serverInfo,
      instructions: mcp.instructions,
      tools: tools.map((t) => ({
        name: t.name,
        title: t.title,
        annotations: t.annotations,
        meta: t._meta,
      })),
    });
  }).pipe(Effect.scoped, exitOnFailure),
).pipe(Command.withDescription("Spawn the solos MCP server over stdio and list its tools"));

const toolName = Args.text({ name: "tool" }).pipe(
  Args.withDescription("Tool name, e.g. solana_wallet_get_balance"),
);
const args = Options.text("args").pipe(
  Options.withDefault("{}"),
  Options.withDescription("JSON object of tool arguments"),
);

const call = Command.make("call", { toolName, args }, (options) =>
  Effect.gen(function* () {
    const mcp = yield* connect;
    const parsed = /** @type {Record<string, unknown>} */ (JSON.parse(options.args));
    const timeout = options.toolName === "solana_market_get_event_summary" ? 190_000 : undefined;
    const result = yield* Effect.promise(() => mcp.callTool(options.toolName, parsed, { timeout }));
    yield* emit(result);
    if (result.isError) process.exitCode = 1;
  }).pipe(Effect.scoped, exitOnFailure),
).pipe(Command.withDescription("Call a tool through the real MCP client, black-box"));

export const mcp = Command.make("mcp").pipe(
  Command.withDescription("Exercise the MCP server as a client would"),
  Command.withSubcommands([list, call]),
);
