// @ts-check
/**
 * Promotion and rollback are pointer flips (ADR-0036): npm dist-tags and the GitHub Release's
 * latest flag move; nothing is rebuilt or published. Both refuse a version npm does not have.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { ReleaseRefused } from "../release/errors.js";
import { promotePlan, rollbackPlan } from "../release/plans.js";
import { assertPublished, currentLatest, runPlan } from "../release/run-plan.js";
import { parseVersion, releaseTag } from "../release/version.js";
import { attempt, dryRun, git } from "./dev-release-shared.js";

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

/** `latest` only ever points at a stable version: a canary never reaches it, nor the registry. */
const stable = (/** @type {string} */ value, /** @type {string} */ flag) => {
  if (parseVersion(semver(value, flag))?.prerelease !== null) {
    throw new ReleaseRefused({
      reason: `${flag} ${value} is a prerelease; latest only ever points at a stable version`,
      remedy: `pass a stable ${flag}, with no prerelease suffix`,
    });
  }
  return value;
};

/**
 * The `server.json` the target release shipped, from its tag, in a fresh directory for
 * `mcp-publisher publish` to read. A tag without one cannot republish the registry.
 * @param {string} version
 */
const registryDirFor = async (version) => {
  const manifest = await git(["show", `${releaseTag(version)}:server.json`]);
  const dir = mkdtempSync(path.join(tmpdir(), "solos-release-"));
  writeFileSync(path.join(dir, "server.json"), manifest);
  return dir;
};

const promoteVersion = Args.text({ name: "version" }).pipe(
  Args.withDescription("The staged version latest should point at"),
);
const skipRegistry = Options.boolean("skip-registry").pipe(
  Options.withDefault(false),
  Options.withDescription("Do not touch the MCP Registry"),
);

export const promote = Command.make(
  "promote",
  { version: promoteVersion, skipRegistry, dryRun },
  (o) =>
    attempt(async () => {
      const version = stable(o.version, "version");
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

/**
 * @param {string} target @param {{ skip: boolean; dryRun: boolean }} mode
 * @returns {Promise<string | undefined>} undefined when the registry is left alone
 */
const rollbackRegistryDir = async (target, { skip, dryRun }) => {
  if (skip) return undefined;
  return dryRun ? `<server.json of ${releaseTag(target)}>` : registryDirFor(target);
};

export const rollback = Command.make("rollback", { to, from, reason, skipRegistry, dryRun }, (o) =>
  attempt(async () => {
    const target = stable(o.to, "--to");
    const bad = Option.isSome(o.from) ? semver(o.from.value, "--from") : await currentLatest();
    if (bad === target) {
      throw new ReleaseRefused({
        reason: `latest already points at ${target}`,
        remedy: "pass --from <the version to deprecate>",
      });
    }
    if (!o.dryRun) await assertPublished(target);
    const registryDir = await rollbackRegistryDir(target, {
      skip: o.skipRegistry,
      dryRun: o.dryRun,
    });
    const plan = rollbackPlan({ to: target, from: bad, reason: o.reason, registryDir });
    const result = await runPlan(plan, { dryRun: o.dryRun });
    if (!result.ok) process.exitCode = 1;
    return { action: "rollback", to: target, from: bad, dryRun: o.dryRun, ...result };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Point latest back at a previous version, deprecate the rolled-back one and republish the registry",
  ),
);
