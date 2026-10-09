// @ts-check
/**
 * Running a plan: in order, stopping at the first failure, every step reported with the command
 * it ran. The runner is injected so tests read argv instead of touching npm or GitHub.
 */
import { captureCommand, lastLine } from "../evidence/run-steps.js";
import { ReleaseRefused } from "./errors.js";
import { latestProbe, publishedProbe, releasePackages } from "./plans.js";
import { compareVersions, parseVersion } from "./version.js";

/** @typedef {(argv: string[], cwd?: string) => Promise<{ code: number; output: string }>} Runner */
/** @typedef {import("./plans.js").Step} Step */
/** @typedef {{ name: string; command: string; ok: boolean | null; summary: string }} RanStep */

/**
 * @param {ReadonlyArray<Step>} steps
 * @param {{ runner?: Runner; dryRun: boolean }} options
 */
export const runPlan = async (steps, { runner = captureCommand, dryRun }) => {
  /** @type {RanStep[]} */
  const ran = [];
  for (const step of steps) {
    const command = step.argv.join(" ");
    if (dryRun) {
      ran.push({ name: step.name, command, ok: null, summary: "dry run" });
      continue;
    }
    const { code, output } = await runner(step.argv, step.cwd);
    ran.push({ name: step.name, command, ok: code === 0, summary: lastLine(output) });
    if (code !== 0) break;
  }
  return { ok: ran.every((step) => step.ok !== false), steps: ran };
};

/**
 * Every release package must already be on npm at `version`: a promotion or rollback never
 * publishes, it only points.
 * @param {string} version @param {Runner} [runner]
 */
export const assertPublished = async (version, runner = captureCommand) => {
  /** @type {string[]} */
  const missing = [];
  for (const pkg of releasePackages()) {
    const { code, output } = await runner(publishedProbe(pkg, version));
    if (code !== 0 || !output.includes(`"${version}"`)) missing.push(pkg);
  }
  if (missing.length > 0) {
    throw new ReleaseRefused({
      reason: `${missing.join(", ")} not published at ${version}`,
      remedy: "promote or roll back only to a version the release workflow published",
    });
  }
};

/**
 * Promotion only moves forward: a version behind what `latest` points at is a rollback in
 * disguise, without rollback's checks and deprecation. Equality is allowed: every step is
 * idempotent, so re-running after a partial flip finishes the remaining pointers.
 * @param {string} version @param {string} latest
 */
export const assertForward = (version, latest) => {
  const next = parseVersion(version);
  const current = parseVersion(latest);
  if (next === null || current === null || compareVersions(next, current) < 0) {
    throw new ReleaseRefused({
      reason: `${version} is older than latest, ${latest}; promote only moves forward`,
      remedy: "promote the staged candidate, or use rollback to go back",
    });
  }
};

/**
 * A rollback must name the release that is actually behind `latest`; on a retry after a partial
 * run, `latest` may already be the target. Anything else would deprecate the wrong version.
 * @param {{ from: string; to: string; latest: string }} input
 */
export const assertRollbackSource = ({ from, to, latest }) => {
  if (latest === from || latest === to) return;
  throw new ReleaseRefused({
    reason: `latest points at ${latest}, which is neither --from ${from} nor --to ${to}`,
    remedy: `pass --from ${latest} to roll back what latest points at`,
  });
};

/** The version `latest` points at now. @param {Runner} [runner] */
export const currentLatest = async (runner = captureCommand) => {
  const { code, output } = await runner(latestProbe());
  const match = /"(\d+\.\d+\.\d+[^"]*)"/u.exec(output);
  if (code !== 0 || match === null) {
    throw new ReleaseRefused({
      reason: "could not read the current latest from npm",
      remedy: "pass --from <version> explicitly",
    });
  }
  return /** @type {string} */ (match[1]);
};
