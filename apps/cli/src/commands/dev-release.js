// @ts-check
/**
 * `solos dev release`: the release lanes' lever (ADR-0036). Versions are derived, a release PR is
 * checked, notes are written from what was merged; promotion and rollback are in the pointer
 * module. Every verb prints JSON and exits non-zero when it refuses.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { checkReleasePr, releaseBranchVersion } from "../release/check.js";
import {
  canaryVersion,
  formatVersion,
  isMajor,
  laneOf,
  releaseTag,
  stableVersion,
} from "../release/version.js";
import { promote, rollback } from "./dev-release-pointer.js";
import { prepare } from "./dev-release-prepare.js";
import {
  attempt,
  baseVersion,
  composeNotes,
  git,
  listDir,
  newestRelease,
  parseManifest,
  readIfPresent,
  required,
} from "./dev-release-shared.js";
import { smoke } from "./dev-release-smoke.js";

const lane = Options.choice("lane", ["canary", "stable"]).pipe(
  Options.withDescription("canary: next patch with a canary prerelease; stable: a bumped release"),
);
const run = Options.integer("run").pipe(
  Options.optional,
  Options.withDescription("Workflow run number, keeps canaries ordered (canary lane)"),
);
const sha = Options.text("sha").pipe(
  Options.optional,
  Options.withDescription("Commit sha the canary is built from (canary lane)"),
);
const bump = Options.choice("bump", ["patch", "minor", "major"]).pipe(
  Options.optional,
  Options.withDescription("How far the stable version moves (stable lane)"),
);
const base = Options.text("base").pipe(
  Options.optional,
  Options.withDescription("Stable version to derive from; default: the newest solos@ tag"),
);

const version = Command.make("version", { lane, run, sha, bump, base }, (o) =>
  attempt(async () => {
    const from = await baseVersion(o.base);
    const next =
      o.lane === "canary"
        ? canaryVersion({
            base: from,
            run: required(o.run, "--run"),
            sha: required(o.sha, "--sha"),
          })
        : stableVersion({ base: from, bump: required(o.bump, "--bump") });
    return {
      version: next,
      lane: laneOf(next),
      tag: releaseTag(next),
      base: formatVersion(from),
      major: isMajor(next, from),
    };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(Command.withDescription("Derive the next version for a lane from the newest solos@ tag"));

const branch = Options.text("branch").pipe(
  Options.optional,
  Options.withDescription("Branch to check; default: the current branch"),
);

const check = Command.make("check", { branch }, (o) =>
  attempt(async () => {
    const name = Option.isSome(o.branch)
      ? o.branch.value
      : ((await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim().split("\n", 1)[0] ?? "");
    const found = releaseBranchVersion(name);
    const notes = found === null ? null : readIfPresent(`docs/releases/${found}.md`);
    const manifest = parseManifest(readIfPresent("server.json"));
    const previous = await newestRelease();
    const adrs = listDir("docs/adr");
    const checked = checkReleasePr({
      branch: name,
      serverJson: manifest.value,
      notes,
      previous,
      adrs,
    });
    const report = {
      ...checked,
      ok: checked.ok && manifest.problems.length === 0,
      problems: [...manifest.problems, ...checked.problems],
    };
    if (!report.ok) process.exitCode = 1;
    return { branch: name, ...report };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Check a release PR: branch, newer than the previous stable, server.json versions, notes, major rules",
  ),
);

const since = Options.text("since").pipe(
  Options.optional,
  Options.withDescription("Tag the notes start after; default: the newest solos@ tag"),
);
const notesVersion = Args.text({ name: "version" }).pipe(
  Args.withDescription("The version the notes are for"),
);
const out = Options.text("out").pipe(
  Options.optional,
  Options.withDescription("Also write the Markdown to this file"),
);

const notes = Command.make("notes", { since, version: notesVersion, out }, (o) =>
  attempt(async () => {
    const tag = Option.isSome(o.since)
      ? o.since.value
      : releaseTag(formatVersion(await baseVersion(Option.none())));
    const composed = await composeNotes(o.version, tag);
    if (Option.isSome(o.out)) {
      mkdirSync(path.dirname(o.out.value), { recursive: true });
      writeFileSync(o.out.value, `${composed.markdown}\n`);
    }
    return { version: o.version, ...composed, out: Option.getOrNull(o.out) };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Write release notes from the merges since a tag and the tool reference diff",
  ),
);

export const release = Command.make("release").pipe(
  Command.withDescription(
    "Release lanes (ADR-0036): derive versions, prepare and check a release PR, write notes, smoke a published version, promote and roll back by pointer",
  ),
  Command.withSubcommands([version, check, notes, prepare, smoke, promote, rollback]),
);
