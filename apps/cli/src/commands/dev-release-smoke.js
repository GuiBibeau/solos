// @ts-check
import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { smokeNpm } from "../release/smoke-npm.js";
import { attempt, stable } from "./dev-release-shared.js";

const version = Args.text({ name: "version" }).pipe(
  Args.withDescription("The published version to install from npm and check"),
);
const prefix = Options.text("prefix").pipe(
  Options.optional,
  Options.withDescription("An existing install prefix to check instead of installing"),
);

/**
 * `solos dev release smoke <version>`: install the published version from npm into an empty
 * prefix and run --version, doctor and mcp list against it (ADR-0036). Exit 1 when a check fails,
 * so the stable lane's promotion waits.
 */
export const smoke = Command.make("smoke", { version, prefix }, (o) =>
  attempt(async () => {
    const result = await smokeNpm(stable(o.version, "version"), {
      prefix: Option.getOrUndefined(o.prefix),
    });
    if (!result.ok) process.exitCode = 1;
    return result;
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Install a published version from npm into an empty prefix and run the smoke checks on it",
  ),
);
