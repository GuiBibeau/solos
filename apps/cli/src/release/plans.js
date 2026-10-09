// @ts-check
/**
 * The commands a promotion or rollback runs (ADR-0036), as argv lists so a test can read them
 * and a dry run can print them. Both are pointer flips: npm dist-tags and the GitHub Release's
 * latest flag. Nothing here spawns anything.
 */
import { TARGETS } from "../build/targets.js";
import { SCOPE } from "../npm/launcher-lib.js";
import { releaseTag } from "./version.js";

/** @typedef {{ name: string; argv: string[]; cwd?: string }} Step */

/** The launcher, then one platform package per build target. */
export const releasePackages = () => [
  `${SCOPE}/cli`,
  ...TARGETS.map((target) => `${SCOPE}/cli-${target.name}`),
];

/** @param {string} version @returns {Step[]} */
const pointLatestAt = (version) => [
  ...releasePackages().map((pkg) => ({
    name: `latest -> ${pkg}@${version}`,
    argv: ["npm", "dist-tag", "add", `${pkg}@${version}`, "latest"],
  })),
  {
    name: `${releaseTag(version)} is the latest release`,
    argv: ["gh", "release", "edit", releaseTag(version), "--latest", "--prerelease=false"],
  },
];

/**
 * Publish the registry from `registryDir`, where the caller has placed the target release's own
 * `server.json` (read from its tag), never the checkout's: a `main` that moved on would advertise
 * the wrong release.
 * @param {string} version @param {string | undefined} registryDir @returns {Step[]}
 */
const registryStep = (version, registryDir) =>
  registryDir === undefined
    ? []
    : [
        {
          name: `MCP Registry publish from ${releaseTag(version)}`,
          argv: ["mcp-publisher", "publish"],
          cwd: registryDir,
        },
      ];

/** @param {{ version: string; registryDir?: string }} input @returns {Step[]} */
export const promotePlan = ({ version, registryDir }) => [
  ...pointLatestAt(version),
  ...registryStep(version, registryDir),
];

/**
 * Point back, republish the registry from the target's manifest, then deprecate the bad version
 * everywhere. The registry comes before the deprecations because a failed deprecation stops the
 * plan, and MCP clients must not keep discovering the rolled-back version (ADR-0036).
 * @param {{ to: string; from: string; reason: string; registryDir?: string }} input
 * @returns {Step[]}
 */
export const rollbackPlan = ({ to, from, reason, registryDir }) => [
  ...pointLatestAt(to),
  ...registryStep(to, registryDir),
  ...releasePackages().map((pkg) => ({
    name: `deprecate ${pkg}@${from}`,
    argv: ["npm", "deprecate", `${pkg}@${from}`, reason],
  })),
];

/** The argv that proves `pkg@version` exists on npm. @param {string} pkg @param {string} version */
export const publishedProbe = (pkg, version) => [
  "npm",
  "view",
  `${pkg}@${version}`,
  "version",
  "--json",
];

/** The argv that reads what `latest` points at now. */
export const latestProbe = () => ["npm", "view", `${SCOPE}/cli`, "dist-tags.latest", "--json"];
