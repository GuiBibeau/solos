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

/** @param {string} name */
const targetNamed = (name) => {
  const target = TARGETS.find((candidate) => candidate.name === name);
  if (target === undefined) {
    const known = TARGETS.map((candidate) => candidate.name).join(", ");
    throw new Error(`unknown build target ${name}; known targets: ${known}, all`);
  }
  return target;
};

/**
 * `all`, one or more comma-separated target names, or nothing for the host.
 * @param {string | undefined} selection
 * @returns {ReadonlyArray<BuildTarget>}
 */
export const selectTargets = (selection) => {
  if (selection === "all") return TARGETS;
  const names = (selection ?? hostTargetName())
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) throw new Error(`no build target named in ${JSON.stringify(selection)}`);
  return names.map((name) => targetNamed(name));
};

/**
 * Node's names for a target's platform, as npm's `os` and `cpu` fields and `process.platform`
 * / `process.arch` spell them. Target names are built from them, so this is a split.
 * @param {BuildTarget} target
 */
export const platformOf = (target) => {
  const [os, cpu] = target.name.split("-", 2);
  return { os: /** @type {string} */ (os), cpu: /** @type {string} */ (cpu) };
};
