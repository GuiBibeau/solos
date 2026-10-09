// @ts-check
/**
 * Prove a published version installs and runs from npm the way a user gets it (ADR-0036): a
 * global install of @solos-sh/cli@<version> into an empty prefix, then the same three checks the
 * build's smoke test runs on a fresh binary. The stable lane runs this on every platform runner
 * before a version is promoted.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hasColdIssues, mcpListCheck, parseJson, run, versionCheck } from "../build/smoke.js";
import { captureCommand } from "../evidence/run-steps.js";
import { laneOf } from "./version.js";

/** @typedef {import("../build/smoke.js").Check} Check */
/** @typedef {(argv: string[], cwd?: string) => Promise<{ code: number; output: string }>} Runner */
/** @typedef {{ ok?: boolean; issues?: { code: string }[]; release?: { version?: unknown; lane?: unknown; commit?: unknown } }} DoctorReport */

/**
 * `npm install -g` into the prefix, as a user would, without touching the runner's own global
 * packages.
 * @param {string} version @param {string} prefix @param {Runner} runner
 * @returns {Promise<Check>}
 */
const installCheck = async (version, prefix, runner) => {
  const argv = ["npm", "install", "-g", `@solos-sh/cli@${version}`, "--prefix", prefix];
  const { code, output } = await runner(argv);
  return {
    name: "install",
    ok: code === 0,
    detail: code === 0 ? `@solos-sh/cli@${version} into ${prefix}` : output.trim().slice(-400),
  };
};

/**
 * `doctor` with nothing configured reports both missing pieces and the release this version is:
 * the version itself, the lane that version implies, and a commit.
 * @param {string} binary @param {string} configDir @param {string} version
 * @returns {Promise<Check>}
 */
const doctorCheck = async (binary, configDir, version) => {
  const { stdout, code } = await run(binary, ["doctor"], { SOLOS_CONFIG_DIR: configDir });
  const report = /** @type {DoctorReport | undefined} */ (parseJson(stdout));
  const release = report?.release;
  const isOk =
    code === 1 &&
    hasColdIssues(report) &&
    release?.version === version &&
    release.lane === laneOf(version) &&
    typeof release.commit === "string";
  return {
    name: "doctor",
    ok: isOk,
    detail: isOk ? `release ${version}, ${laneOf(version)}` : stdout,
  };
};

/**
 * @param {string} version
 * @param {{ runner?: Runner; prefix?: string }} [options] `prefix` is an existing install to
 *   check instead of installing (tests point it at a stub)
 * @returns {Promise<{ ok: boolean; version: string; prefix: string; checks: Check[] }>}
 */
export const smokeNpm = async (version, { runner = captureCommand, prefix } = {}) => {
  const root = prefix ?? (await mkdtemp(path.join(tmpdir(), "solos-npm-smoke-")));
  const configDir = await mkdtemp(path.join(tmpdir(), "solos-npm-smoke-config-"));
  try {
    const checks = prefix === undefined ? [await installCheck(version, root, runner)] : [];
    if (checks.every((check) => check.ok)) {
      const binary = path.join(root, "bin", "solos");
      checks.push(
        await versionCheck(binary, version),
        await doctorCheck(binary, configDir, version),
        await mcpListCheck(binary, configDir, version),
      );
    }
    return { ok: checks.every((check) => check.ok), version, prefix: root, checks };
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
};
