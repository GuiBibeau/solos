// @ts-check
import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { parseAllowedMintsFlag, parseMinInterval } from "./config.js";
import { asStartupError, exitOnFailure } from "./output.js";
import { startEngine } from "./start.js";

const tier = Options.choice("tier", ["read", "simulate", "execute"]).pipe(
  Options.optional,
  Options.withDescription(
    "Tier ceiling: read, simulate or execute. Default simulate. Wins over SOLOS_TOOL_TIER",
  ),
);

const paper = Options.boolean("paper").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Boot a Surfpool fork, fund the signer, and run the execute tier against it",
  ),
);

const host = Options.text("host").pipe(
  Options.withDefault("127.0.0.1"),
  Options.withDescription("Bind address. Loopback by default"),
);

const port = Options.integer("port").pipe(
  Options.withDefault(8787),
  Options.withDescription("TCP port to listen on"),
);

const dataDir = Options.text("data-dir").pipe(
  Options.optional,
  Options.withDescription("Directory for the engine database. Default ~/.config/solos/engine"),
);

const allowedMints = Options.text("allowed-mints").pipe(
  Options.optional,
  Options.withDescription(
    "Mint allowlist. Required for --tier execute: addresses, or any. Paper and dry-run default to any",
  ),
);

const minInterval = Options.text("min-interval").pipe(
  Options.optional,
  Options.withDescription(
    "Shortest clock interval, such as 10s. Wins over SOLOS_STRATEGY_MIN_INTERVAL. Default 10s",
  ),
);

/**
 * @template T
 * @param {import("effect/Option").Option<T>} value
 * @returns {T | undefined}
 */
const defined = (value) => Option.getOrUndefined(value);

/** @param {unknown} error */
const startupFailure = (error) => asStartupError(error);

/**
 * @param {{
 *   tier: import("effect/Option").Option<"read" | "simulate" | "execute">;
 *   paper: boolean;
 *   host: string;
 *   port: number;
 *   dataDir: import("effect/Option").Option<string>;
 *   allowedMints: import("effect/Option").Option<string>;
 *   minInterval: import("effect/Option").Option<string>;
 * }} options
 */
const run = (options) =>
  Effect.tryPromise({
    try: () => runUntilSignal(options),
    catch: startupFailure,
  }).pipe(exitOnFailure);

/**
 * @param {{
 *   tier: import("effect/Option").Option<"read" | "simulate" | "execute">;
 *   paper: boolean;
 *   host: string;
 *   port: number;
 *   dataDir: import("effect/Option").Option<string>;
 *   allowedMints: import("effect/Option").Option<string>;
 *   minInterval: import("effect/Option").Option<string>;
 * }} options
 */
const runUntilSignal = async (options) => {
  const requested = defined(options.minInterval);
  const handle = await startEngine({
    env: process.env,
    tier: defined(options.tier),
    paper: options.paper,
    host: options.host,
    port: options.port,
    dataDir: defined(options.dataDir),
    tickDrive: "auto",
    ...(Option.isSome(options.allowedMints) && {
      allowedMints: parseAllowedMintsFlag(options.allowedMints.value),
    }),
    ...(requested !== undefined && { minIntervalMs: parseMinInterval(requested) }),
  });
  await new Promise((resolve) => {
    process.once("SIGINT", () => resolve(undefined));
    process.once("SIGTERM", () => resolve(undefined));
  });
  await handle.stop();
};

/** @param {string} name */
export const engineStartCommand = (name) =>
  Command.make(name, { tier, paper, host, port, dataDir, allowedMints, minInterval }, run).pipe(
    Command.withDescription(
      "Start the engine. No flags: dry run, simulate works and execute is refused. --paper runs on Surfpool. --tier execute is live.",
    ),
  );

export const engine = Command.make("engine").pipe(
  Command.withDescription("Hold the hot key and execute Actions over HTTP"),
  Command.withSubcommands([engineStartCommand("start")]),
);
