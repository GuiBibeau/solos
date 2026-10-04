// @ts-check
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { emit } from "../output.js";
import { build } from "./dev-build.js";
import { inspect } from "./dev-chain-inspect.js";
import { docs } from "./dev-docs.js";
import { qa } from "./dev-qa.js";
import { surfpool } from "./dev-surfpool.js";
import { evidence, verify } from "./dev-verify.js";

/**
 * Run a repo script with inherited stdio and mirror its exit code.
 * @param {string[]} argv
 */
const run = (argv) =>
  Effect.promise(async () => {
    const proc = Bun.spawn(argv, { stdio: ["inherit", "inherit", "inherit"] });
    const code = await proc.exited;
    process.exitCode = code;
    return { command: argv.join(" "), exitCode: code };
  });

const check = Command.make("check", {}, () =>
  run(["bun", "run", "check"]).pipe(Effect.flatMap(emit)),
).pipe(Command.withDescription("Format check, lint, dependency rules, and type check"));

const filter = Options.text("filter").pipe(
  Options.optional,
  Options.withDescription("Test name pattern, e.g. a slice name"),
);
const integrationOnly = Options.boolean("integration").pipe(
  Options.withDescription("Only tests tagged [integration]"),
);

const test = Command.make("test", { filter, integrationOnly }, (o) => {
  const argv = ["bun", "test"];
  if (o.integrationOnly) argv.push("--test-name-pattern", String.raw`\[integration\]`);
  if (o.filter._tag === "Some") argv.push("--test-name-pattern", o.filter.value);
  return run(argv).pipe(Effect.flatMap(emit));
}).pipe(Command.withDescription("Run tests; Surfpool starts automatically for integration tests"));

export const dev = Command.make("dev").pipe(
  Command.withDescription("Developer and agent verification lever"),
  Command.withSubcommands([surfpool, inspect, check, docs, qa, test, verify, evidence, build]),
);
