// @ts-check
/**
 * Running a plan: in order, stopping at the first failure, every step reported with the command
 * it ran. The runner is injected so tests read argv instead of touching npm or GitHub.
 */
import { captureCommand, lastLine } from "../evidence/run-steps.js";
import { ReleaseRefused } from "./errors.js";
import { deprecatedProbe, latestProbe, publishedProbe, releasePackages } from "./plans.js";
import { compareVersions, parseVersion } from "./version.js";

/** @typedef {(argv: string[], cwd?: string) => Promise<{ code: number; output: string }>} Runner */
/** @typedef {import("./plans.js").Step} Step */
/** @typedef {{ name: string; command: string; ok: boolean | null; summary: string }} RanStep */

const PLAIN = /^[\w@%+=:,./-]+$/u;

/** argv as a shell would need it typed: arguments with spaces or metacharacters are quoted. @param {ReadonlyArray<string>} argv */
export const displayCommand = (argv) =>
  argv
    .map((arg) => (PLAIN.test(arg) ? arg : `'${arg.replaceAll("'", String.raw`'\''`)}'`))
    .join(" ");

export const REGISTRY_URL = "https://registry.modelcontextprotocol.io";

/** What the probe learned: an HTTP status, or the curl exit when no request completed. @param {number} code @param {string} output */
const registryAnswer = (code, output) =>
  code === 0 ? `HTTP ${/^(\d{3})/u.exec(output.trim())?.[1] ?? "?"}` : `curl exit ${code}`;

/**
 * Whether the MCP Registry already lists this server version: a promote retry must not publish
 * it twice, since the registry refuses a duplicate. Only a 200 or a 404 is an answer; any other
 * status, or a transport failure, refuses before a single pointer moves.
 * @param {{ name: string; version: string }} server @param {Runner} [runner]
 */
export const registryHasVersion = async ({ name, version }, runner = captureCommand) => {
  const url = `${REGISTRY_URL}/v0.1/servers/${encodeURIComponent(name)}/versions/${version}`;
  const { code, output } = await runner([
    "curl",
    "-sS",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    url,
  ]);
  const answer = registryAnswer(code, output);
  if (answer === "HTTP 200") return true;
  if (answer === "HTTP 404") return false;
  throw new ReleaseRefused({
    reason: `MCP Registry lookup for ${name}@${version} failed (${answer}); nothing was changed`,
    remedy: "retry when the registry answers, or pass --skip-registry to promote without it",
  });
};

/**
 * @param {ReadonlyArray<Step>} steps
 * @param {{ runner?: Runner; dryRun: boolean }} options
 */
export const runPlan = async (steps, { runner = captureCommand, dryRun }) => {
  /** @type {RanStep[]} */
  const ran = [];
  for (const step of steps) {
    const command = displayCommand(step.argv);
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

/**
 * `latest` never points at a version that npm marks deprecated: a rolled-back release stays
 * published, deprecated, and a stale promote of it would reinstate the known-bad build.
 * @param {string} version @param {Runner} [runner]
 */
export const assertNotDeprecated = async (version, runner = captureCommand) => {
  for (const pkg of releasePackages()) {
    const { code, output } = await runner(deprecatedProbe(pkg, version));
    const message = output.trim().replaceAll(/^"|"$/gu, "");
    if (code === 0 && message !== "undefined" && message !== "null" && message.length > 0) {
      throw new ReleaseRefused({
        reason: `${pkg}@${version} is deprecated on npm: ${message}`,
        remedy: "a rolled-back version is not promoted again; promote the next patch release",
      });
    }
  }
};

/**
 * The manifest `mcp-publisher` would publish must name the version being promoted in both of
 * its version fields, or the registry would advertise a different release than npm serves.
 * @param {string} manifestText @param {string} version
 */
export const assertManifestVersion = (manifestText, version) => {
  /** @type {{ version?: unknown; packages?: Array<{ version?: unknown }> }} */
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new ReleaseRefused({
      reason: `the server.json at solos@${version} is not valid JSON`,
      remedy: "fix the manifest in a patch release, or pass --skip-registry",
    });
  }
  const packaged = manifest.packages?.[0]?.version;
  if (packaged !== version || manifest.version !== version) {
    throw new ReleaseRefused({
      reason: `the server.json at solos@${version} names version ${String(manifest.version)} and package version ${String(packaged)}, not ${version}`,
      remedy: "fix the manifest in a patch release, or pass --skip-registry",
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
