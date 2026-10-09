// @ts-check
/**
 * `solos dev release`: the release lanes' lever (ADR-0036). Versions are derived, a release PR is
 * checked, notes are written from what was merged; promotion and rollback are in the pointer
 * module. Every verb prints JSON and exits non-zero when it refuses.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { checkReleasePr, releaseBranchVersion } from "../release/check.js";
import { diffToolRows, parseSubjects, renderNotes, toolRows } from "../release/notes.js";
import {
  canaryVersion,
  formatVersion,
  isMajor,
  laneOf,
  releaseTag,
  stableVersion,
} from "../release/version.js";
import { promote, rollback } from "./dev-release-pointer.js";
import {
  TOOL_REFERENCE,
  attempt,
  baseVersion,
  git,
  gitShowOrEmpty,
  required,
} from "./dev-release-shared.js";

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
      major: isMajor(next),
    };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(Command.withDescription("Derive the next version for a lane from the newest solos@ tag"));

const branch = Options.text("branch").pipe(
  Options.optional,
  Options.withDescription("Branch to check; default: the current branch"),
);

/** @param {string} path */
const readIfPresent = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);

const check = Command.make("check", { branch }, (o) =>
  attempt(async () => {
    const name = Option.isSome(o.branch)
      ? o.branch.value
      : ((await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim().split("\n", 1)[0] ?? "");
    const found = releaseBranchVersion(name);
    const notes = found === null ? null : readIfPresent(`docs/releases/${found}.md`);
    const serverJson = JSON.parse(readIfPresent("server.json") ?? "{}");
    const report = checkReleasePr({ branch: name, serverJson, notes });
    if (!report.ok) process.exitCode = 1;
    return { branch: name, ...report };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription("Check a release PR: branch, server.json versions, notes, major rules"),
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
    const entries = parseSubjects(await git(["log", `${tag}..HEAD`, "--format=%s", "--no-merges"]));
    const before = toolRows(await gitShowOrEmpty(`${tag}:${TOOL_REFERENCE}`));
    const after = toolRows(readIfPresent(TOOL_REFERENCE) ?? "");
    const toolDiff = diffToolRows(before, after);
    const major = isMajor(o.version);
    const markdown = renderNotes({ version: o.version, since: tag, entries, toolDiff, major });
    if (Option.isSome(o.out)) {
      mkdirSync(path.dirname(o.out.value), { recursive: true });
      writeFileSync(o.out.value, `${markdown}\n`);
    }
    return {
      version: o.version,
      since: tag,
      entries: entries.length,
      toolDiff,
      major,
      out: Option.getOrNull(o.out),
      markdown,
    };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Write release notes from the merges since a tag and the tool reference diff",
  ),
);

export const release = Command.make("release").pipe(
  Command.withDescription(
    "Release lanes (ADR-0036): derive versions, check a release PR, write notes, promote and roll back by pointer",
  ),
  Command.withSubcommands([version, check, notes, promote, rollback]),
);
