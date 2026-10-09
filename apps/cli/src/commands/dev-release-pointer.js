// @ts-check
/**
 * Promotion and rollback are pointer flips (ADR-0036): npm dist-tags and the GitHub Release's
 * latest flag move; nothing is rebuilt or published. Both refuse a version npm does not have,
 * accept only stable versions; promote publishes the MCP Registry from the target tag's own manifest
 * and rollback leaves the registry alone, because its versions are immutable.
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
import { compareVersions, parseVersion, releaseTag } from "../release/version.js";
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
 * The `server.json` the target release shipped, read from its tag into a fresh directory for
 * `mcp-publisher publish`. The checkout's own manifest is never used: a `main` that moved on
 * would advertise the wrong release. A tag without a manifest cannot publish the registry.
 * @param {string} version
 */
const registryDirFor = async (version) => {
  const manifest = await git(["show", `${releaseTag(version)}:server.json`]);
  const dir = mkdtempSync(path.join(tmpdir(), "solos-release-"));
  writeFileSync(path.join(dir, "server.json"), manifest);
  return dir;
};

/**
 * @param {string} target @param {{ skip: boolean; dryRun: boolean }} mode
 * @returns {Promise<string | undefined>} undefined when the registry is left alone
 */
const registryDirMaybe = async (target, { skip, dryRun: dry }) => {
  if (skip) return undefined;
  return dry ? `<server.json of ${releaseTag(target)}>` : registryDirFor(target);
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
      const registryDir = await registryDirMaybe(version, {
        skip: o.skipRegistry,
        dryRun: o.dryRun,
      });
      const result = await runPlan(promotePlan({ version, registryDir }), { dryRun: o.dryRun });
      if (!result.ok) process.exitCode = 1;
      return { action: "promote", version, dryRun: o.dryRun, ...result };
    }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription("Point latest at a published version and publish it to the MCP Registry"),
);

/** What a rollback cannot do, stated in the result rather than attempted and failed. */
const REGISTRY_UNCHANGED = Object.freeze({
  changed: false,
  reason: "MCP Registry versions are immutable; a version that exists cannot be published again",
  remedy: "fix forward: prepare a patch release and promote it, which publishes the registry",
});

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
    const target = stable(o.to, "--to");
    if (o.reason.trim().length === 0) {
      throw new ReleaseRefused({
        reason: "--reason is empty; npm reads an empty deprecation message as un-deprecating",
        remedy: "pass --reason <why this version is rolled back>",
      });
    }
    const bad = Option.isSome(o.from) ? semver(o.from.value, "--from") : await currentLatest();
    // A rollback restores a previous release: --to must be older than --from, never equal or
    // newer, or the "rollback" would move every latest pointer forward.
    const toParsed = /** @type {import("../release/version.js").Version} */ (parseVersion(target));
    const fromParsed = /** @type {import("../release/version.js").Version} */ (parseVersion(bad));
    if (compareVersions(toParsed, fromParsed) >= 0) {
      throw new ReleaseRefused({
        reason: `--to ${target} is not older than --from ${bad}; a rollback restores a previous release`,
        remedy: "pass --to <an earlier published version>, or promote the newer one instead",
      });
    }
    // Both versions are checked before any pointer moves, so a mistyped --from cannot leave a
    // half-done rollback behind a failed deprecation.
    if (!o.dryRun) {
      await assertPublished(target);
      await assertPublished(bad);
    }
    const plan = rollbackPlan({ to: target, from: bad, reason: o.reason });
    const result = await runPlan(plan, { dryRun: o.dryRun });
    if (!result.ok) process.exitCode = 1;
    return {
      action: "rollback",
      to: target,
      from: bad,
      dryRun: o.dryRun,
      registry: REGISTRY_UNCHANGED,
      ...result,
    };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Point latest back at a previous version and deprecate the rolled-back one; the registry is fix-forward",
  ),
);
