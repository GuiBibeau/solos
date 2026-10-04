// @ts-check
/**
 * The platforms `solos dev build` compiles for (ADR-0035). One Bun compile target each; the
 * binary name is what a release attaches and what the install script downloads.
 * @typedef {{ name: string; target: Bun.Build.CompileTarget; binary: string }} BuildTarget
 */

/** @type {ReadonlyArray<BuildTarget>} */
export const TARGETS = Object.freeze([
  { name: "darwin-arm64", target: "bun-darwin-arm64", binary: "solos-darwin-arm64" },
  { name: "darwin-x64", target: "bun-darwin-x64", binary: "solos-darwin-x64" },
  { name: "linux-x64", target: "bun-linux-x64", binary: "solos-linux-x64" },
  { name: "linux-arm64", target: "bun-linux-arm64", binary: "solos-linux-arm64" },
]);

/** The target name for the machine running the build: the only one its smoke test can run. */
export const hostTargetName = (platform = process.platform, arch = process.arch) =>
  `${platform}-${arch}`;

/**
 * `all`, one target name, or nothing for the host.
 * @param {string | undefined} selection
 * @returns {ReadonlyArray<BuildTarget>}
 */
export const selectTargets = (selection) => {
  if (selection === "all") return TARGETS;
  const name = selection ?? hostTargetName();
  const target = TARGETS.find((candidate) => candidate.name === name);
  if (target === undefined) {
    const known = TARGETS.map((candidate) => candidate.name).join(", ");
    throw new Error(`unknown build target ${name}; known targets: ${known}, all`);
  }
  return [target];
};
