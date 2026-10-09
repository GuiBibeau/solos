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

/** @param {{ version: string; registry: boolean }} input @returns {Step[]} */
export const promotePlan = ({ version, registry }) => [
  ...pointLatestAt(version),
  ...(registry ? [{ name: "MCP Registry publish", argv: ["mcp-publisher", "publish"] }] : []),
];

/**
 * Point back, deprecate the bad version everywhere, then republish the MCP Registry from the
 * target's own `server.json`, which the caller has placed in `registryDir` (ADR-0036). Without
 * that last step MCP clients would keep discovering the rolled-back version.
 * @param {{ to: string; from: string; reason: string; registryDir?: string }} input
 * @returns {Step[]}
 */
export const rollbackPlan = ({ to, from, reason, registryDir }) => [
  ...pointLatestAt(to),
  ...releasePackages().map((pkg) => ({
    name: `deprecate ${pkg}@${from}`,
    argv: ["npm", "deprecate", `${pkg}@${from}`, reason],
  })),
  ...(registryDir === undefined
    ? []
    : [
        {
          name: `MCP Registry republish from ${releaseTag(to)}`,
          argv: ["mcp-publisher", "publish"],
          cwd: registryDir,
        },
      ]),
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
