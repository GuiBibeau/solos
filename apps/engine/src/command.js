// @ts-check
import { Command, Options } from "@effect/cli";
import { ValidationError } from "@solos/core";
import { AddressSchema } from "@solos-sh/actions";
import { Effect, Option } from "effect";
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
    "Comma-separated mint addresses the Engine allowlist permits. Omit to allow any mint",
  ),
);

/** @param {string | undefined} raw */
const parseMints = (raw) => {
  if (raw === undefined || raw.trim().length === 0) return [];
  const mints = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (mints.every((mint) => AddressSchema.safeParse(mint).success)) return mints;
  throw new ValidationError({
    field: "allowed-mints",
    value: null,
    reason: "allowed-mints entries must be mint addresses",
    remedy: "pass comma-separated base58 mint addresses, or omit the flag",
  });
};

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
 * }} options
 */
const runUntilSignal = async (options) => {
  const handle = await startEngine({
    env: process.env,
    tier: defined(options.tier),
    paper: options.paper,
    host: options.host,
    port: options.port,
    dataDir: defined(options.dataDir),
    ...(Option.isSome(options.allowedMints) && {
      allowedMints: parseMints(options.allowedMints.value),
    }),
  });
  await new Promise((resolve) => {
    process.once("SIGINT", () => resolve(undefined));
    process.once("SIGTERM", () => resolve(undefined));
  });
  await handle.stop();
};

/** @param {string} name */
export const engineStartCommand = (name) =>
  Command.make(name, { tier, paper, host, port, dataDir, allowedMints }, run).pipe(
    Command.withDescription(
      "Start the engine. No flags: dry run, simulate works and execute is refused. --paper runs on Surfpool. --tier execute is live.",
    ),
  );

export const engine = Command.make("engine").pipe(
  Command.withDescription("Hold the hot key and execute Actions over HTTP"),
  Command.withSubcommands([engineStartCommand("start")]),
);
