// @ts-check
/**
 * Version arithmetic for the release lanes (ADR-0036). A version is derived, never typed: a
 * canary is the newest stable tag plus one patch with a `canary.<run>.g<sha>` prerelease, a
 * stable is that tag bumped once. Pure: tags come in as strings, nothing is read here.
 */
import { ReleaseRefused } from "./errors.js";

/** @typedef {{ major: number; minor: number; patch: number; prerelease: string | null }} Version */
/** @typedef {"patch" | "minor" | "major"} Bump */
/** @typedef {"source" | "canary" | "stable"} Lane */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?$/u;
export const TAG_PREFIX = "solos@";

/** @param {string} text @returns {Version | null} */
export const parseVersion = (text) => {
  const match = SEMVER.exec(text);
  if (match === null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
};

/** @param {Version} version */
export const formatVersion = ({ major, minor, patch, prerelease }) =>
  `${major}.${minor}.${patch}${prerelease === null ? "" : `-${prerelease}`}`;

/** @param {string} version */
export const releaseTag = (version) => `${TAG_PREFIX}${version}`;

/** @param {Version} a @param {Version} b */
const compare = (a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch;

/**
 * The newest stable version among `solos@*` tags; prereleases and foreign tags are ignored.
 * @param {ReadonlyArray<string>} tags
 * @returns {Version | null}
 */
export const newestStable = (tags) => {
  /** @type {Version | null} */
  let best = null;
  for (const tag of tags) {
    if (!tag.startsWith(TAG_PREFIX)) continue;
    const version = parseVersion(tag.slice(TAG_PREFIX.length));
    if (version === null || version.prerelease !== null) continue;
    if (best === null || compare(version, best) > 0) best = version;
  }
  return best;
};

/**
 * The next patch of `base` with a `canary.<run>.g<short sha>` prerelease; the run number keeps
 * canaries ordered and the sha names the commit.
 * @param {{ base: Version; run: number; sha: string }} input
 */
export const canaryVersion = ({ base, run, sha }) => {
  if (!Number.isSafeInteger(run) || run < 0) {
    throw new ReleaseRefused({
      reason: `run must be a non-negative integer, got ${String(run)}`,
      remedy: "pass the workflow run number as --run",
    });
  }
  if (!/^[0-9a-f]{7,40}$/u.test(sha)) {
    throw new ReleaseRefused({
      reason: `sha must be 7 to 40 lowercase hex characters, got ${sha}`,
      remedy: "pass the commit sha as --sha",
    });
  }
  return formatVersion({
    ...base,
    patch: base.patch + 1,
    prerelease: `canary.${run}.g${sha.slice(0, 7)}`,
  });
};

/** @param {{ base: Version; bump: Bump }} input */
export const stableVersion = ({ base, bump }) => {
  if (bump === "major")
    return formatVersion({ major: base.major + 1, minor: 0, patch: 0, prerelease: null });
  if (bump === "minor")
    return formatVersion({ ...base, minor: base.minor + 1, patch: 0, prerelease: null });
  return formatVersion({ ...base, patch: base.patch + 1, prerelease: null });
};

/**
 * The lane a running binary belongs to, read from nothing but its version: a checkout is
 * `0.0.0`, a canary carries the `canary.` identifier, everything else is stable.
 * @param {string} version @returns {Lane}
 */
export const laneOf = (version) => {
  const parsed = parseVersion(version);
  if (parsed === null || version === "0.0.0") return "source";
  if (parsed.prerelease?.startsWith("canary.")) return "canary";
  return "stable";
};

/** A release that starts a new major: `x.0.0` with no prerelease. @param {string} version */
export const isMajor = (version) => {
  const parsed = parseVersion(version);
  return parsed !== null && parsed.prerelease === null && parsed.minor === 0 && parsed.patch === 0;
};
