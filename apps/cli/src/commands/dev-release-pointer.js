// @ts-check
/**
 * Promotion and rollback are pointer flips (ADR-0036): npm dist-tags and the GitHub Release's
 * latest flag move; nothing is rebuilt or published. Both refuse a version npm does not have.
 */
import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { ReleaseRefused } from "../release/errors.js";
import { promotePlan, rollbackPlan } from "../release/plans.js";
import { assertPublished, currentLatest, runPlan } from "../release/run-plan.js";
import { parseVersion } from "../release/version.js";
import { attempt, dryRun } from "./dev-release-shared.js";

/** @param {string} value @param {string} flag */
const semver = (value, flag) => {
  if (parseVersion(value) === null) {
    throw new ReleaseRefused({
      reason: `${flag} ${value} is not a semver version`,
      remedy: `pass ${flag} <major.minor.patch>`,
    });
  }
  return value;
};

const promoteVersion = Args.text({ name: "version" }).pipe(
  Args.withDescription("The staged version latest should point at"),
);
const skipRegistry = Options.boolean("skip-registry").pipe(
  Options.withDefault(false),
  Options.withDescription("Do not run mcp-publisher publish afterwards"),
);

export const promote = Command.make(
  "promote",
  { version: promoteVersion, skipRegistry, dryRun },
  (o) =>
    attempt(async () => {
      const version = semver(o.version, "version");
      if (!o.dryRun) await assertPublished(version);
      const plan = promotePlan({ version, registry: !o.skipRegistry });
      const result = await runPlan(plan, { dryRun: o.dryRun });
      if (!result.ok) process.exitCode = 1;
      return { action: "promote", version, dryRun: o.dryRun, ...result };
    }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription("Point latest at a published version and publish it to the MCP Registry"),
);

const to = Options.text("to").pipe(
  Options.withDescription("The previously published version latest should point at again"),
);
const from = Options.text("from").pipe(
  Options.optional,
  Options.withDescription("The version being rolled back; default: what latest points at now"),
);
const reason = Options.text("reason").pipe(
  Options.withDefault("rolled back; install the version latest points at"),
  Options.withDescription("The npm deprecation message on the rolled-back version"),
);

export const rollback = Command.make("rollback", { to, from, reason, dryRun }, (o) =>
  attempt(async () => {
    const target = semver(o.to, "--to");
    const bad = Option.isSome(o.from) ? semver(o.from.value, "--from") : await currentLatest();
    if (bad === target) {
      throw new ReleaseRefused({
        reason: `latest already points at ${target}`,
        remedy: "pass --from <the version to deprecate>",
      });
    }
    if (!o.dryRun) await assertPublished(target);
    const result = await runPlan(rollbackPlan({ to: target, from: bad, reason: o.reason }), {
      dryRun: o.dryRun,
    });
    if (!result.ok) process.exitCode = 1;
    return { action: "rollback", to: target, from: bad, dryRun: o.dryRun, ...result };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Point latest back at a previous version and deprecate the rolled-back one",
  ),
);
