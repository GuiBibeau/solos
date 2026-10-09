// @ts-check
/**
 * `solos dev release prepare`: the stable lane starts here (ADR-0036). From the newest stable
 * tag and a bump it derives the version, checks out `release/x.y.z`, moves both version fields
 * of server.json, writes docs/releases/x.y.z.md from the merges since that tag, commits the two
 * files and opens the release PR. Merging that PR is the approval; the workflows do the rest.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { captureCommand } from "../evidence/run-steps.js";
import { emit, exitOnFailure } from "../output.js";
import { ReleaseRefused } from "../release/errors.js";
import { bumpedManifest } from "../release/manifest.js";
import { formatVersion, isMajor, releaseTag, stableVersion } from "../release/version.js";
import {
  assertCleanTree,
  attempt,
  composeNotes,
  dryRun,
  git,
  newestRelease,
  readIfPresent,
} from "./dev-release-shared.js";

const bump = Options.choice("bump", ["patch", "minor", "major"]).pipe(
  Options.withDescription("How far the stable version moves from the newest solos@ tag"),
);
const noPr = Options.boolean("no-pr").pipe(
  Options.withDescription(
    "Branch, bump, write the notes and commit, but do not push or open the PR",
  ),
);

/** @typedef {{ version: string; branch: string; previous: string; major: boolean; notesFile: string }} Plan */

/** @param {"patch" | "minor" | "major"} how @returns {Promise<Plan>} */
const planFor = async (how) => {
  const previous = await newestRelease();
  const version = stableVersion({ base: previous, bump: how });
  return {
    version,
    branch: `release/${version}`,
    previous: formatVersion(previous),
    major: isMajor(version, previous),
    notesFile: `docs/releases/${version}.md`,
  };
};

/** The branch, the two files and the commit. @param {Plan} plan */
const writeRelease = async (plan) => {
  const manifest = bumpedManifest(readIfPresent("server.json"), plan.version);
  const notes = await composeNotes(plan.version, releaseTag(plan.previous));
  await git(["checkout", "-q", "-b", plan.branch]);
  writeFileSync("server.json", manifest);
  mkdirSync(path.dirname(plan.notesFile), { recursive: true });
  writeFileSync(plan.notesFile, `${notes.markdown}\n`);
  await git(["add", "server.json", plan.notesFile]);
  await git(["commit", "-q", "-m", `release: ${plan.version}`]);
  return { commit: (await git(["rev-parse", "HEAD"])).trim(), entries: notes.entries };
};

/** Push the branch and open the release PR with gh; its URL is the result. @param {Plan} plan */
const openPr = async (plan) => {
  await git(["push", "-q", "-u", "origin", plan.branch]);
  const body = [
    `Release ${plan.version} (ADR-0036). Merging this PR is the approval: a workflow tags`,
    `\`solos@${plan.version}\` at the merge commit, publishes it under \`staged\`, smokes the install`,
    "from npm on every platform and promotes it to `latest`.",
    "",
    `Review per docs/releases/README.md${plan.major ? ": a major needs the Migration section, the ADR link and the stability-label diff" : ""}.`,
  ].join("\n");
  const result = await captureCommand([
    "gh",
    "pr",
    "create",
    "--base",
    "main",
    "--head",
    plan.branch,
    "--title",
    `release: ${plan.version}`,
    "--body",
    body,
  ]);
  if (result.code !== 0) {
    throw new ReleaseRefused({
      reason: `gh pr create failed: ${result.output.trim().split("\n").at(-1) ?? ""}`,
      remedy: `the branch is pushed; open the PR by hand or re-run with --no-pr and gh pr create`,
    });
  }
  return (result.stdout ?? result.output).trim().split("\n").at(-1) ?? "";
};

export const prepare = Command.make("prepare", { bump, noPr, dryRun }, (o) =>
  attempt(async () => {
    const plan = await planFor(o.bump);
    if (o.dryRun) return { ...plan, dryRun: true, commit: null, pr: null };
    await assertCleanTree();
    const written = await writeRelease(plan);
    const pr = o.noPr ? null : await openPr(plan);
    return { ...plan, dryRun: false, ...written, pr };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Start a stable release: branch release/x.y.z, bump server.json, write the notes, commit and open the PR",
  ),
);
