// @ts-check
/**
 * Running a plan: in order, stopping at the first failure, every step reported with the command
 * it ran. The runner is injected so tests read argv instead of touching npm or GitHub.
 */
import { captureCommand, lastLine } from "../evidence/run-steps.js";
import { ReleaseRefused } from "./errors.js";
import { latestProbe, publishedProbe, releasePackages } from "./plans.js";

/** @typedef {(argv: string[]) => Promise<{ code: number; output: string }>} Runner */
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
    const { code, output } = await runner(step.argv);
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
