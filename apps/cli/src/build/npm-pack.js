// @ts-check
/**
 * Assemble the npm packages a release publishes from the binaries `solos dev build` produced:
 * one platform package per binary (the file and nothing else) and the launcher `@solos-sh/cli`,
 * whose optional dependencies pin those platform packages at the same version (ADR-0035). Nothing
 * here publishes; the release workflow runs `npm publish` on each directory in the returned order.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCOPE, SUPPORTED } from "../npm/launcher-lib.js";
import { platformOf, TARGETS } from "./targets.js";

/** @typedef {{ name: string; dir: string; version: string }} Packed */

const LAUNCHER_FILES = ["launcher.js", "launcher-lib.js"];
const launcherFile = (/** @type {string} */ name) =>
  fileURLToPath(new URL(`../npm/${name}`, import.meta.url));
const LICENSE = fileURLToPath(new URL("../../../../LICENSE", import.meta.url));
const REPO = "https://github.com/GuiBibeau/solos";
const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
/** npm search terms for the launcher; the GitHub repo carries the same topics. */
const KEYWORDS = [
  "solana",
  "mcp",
  "mcp-server",
  "model-context-protocol",
  "ai-agents",
  "llm-agents",
  "claude",
  "cursor",
  "codex",
  "defi",
  "trading",
  "perpetuals",
  "jupiter",
  "kamino",
  "cli",
];

/** The fields every published package shares. @param {string} version */
const shared = (version) => ({
  version,
  license: "Apache-2.0",
  repository: { type: "git", url: `git+${REPO}.git`, directory: "apps/cli" },
  homepage: `${REPO}#readme`,
  bugs: `${REPO}/issues`,
  publishConfig: { access: "public" },
});

/** @param {string} file @param {unknown} value */
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/**
 * One platform package: the binary under `bin/solos`, flagged for its `os` and `cpu` so npm
 * installs exactly one of them.
 * @param {{ target: import("./targets.js").BuildTarget; dist: string; outdir: string; version: string }} input
 * @returns {Packed | null} null when that binary was not built
 */
const packPlatform = ({ target, dist, outdir, version }) => {
  const binary = path.join(dist, target.binary);
  if (!existsSync(binary)) return null;
  const { os, cpu } = platformOf(target);
  const name = `${SCOPE}/cli-${target.name}`;
  const dir = path.join(outdir, `cli-${target.name}`);
  mkdirSync(path.join(dir, "bin"), { recursive: true });
  copyFileSync(binary, path.join(dir, "bin", "solos"));
  chmodSync(path.join(dir, "bin", "solos"), 0o755);
  copyFileSync(LICENSE, path.join(dir, "LICENSE"));
  writeJson(path.join(dir, "package.json"), {
    name,
    description: `The compiled solos binary for ${os} ${cpu}, installed by @solos-sh/cli`,
    ...shared(version),
    os: [os],
    cpu: [cpu],
    files: ["bin"],
  });
  writeFileSync(
    path.join(dir, "README.md"),
    `# ${name}\n\nThe compiled \`solos\` binary for ${os} ${cpu}. Install \`@solos-sh/cli\` instead; npm picks this package for your platform.\n`,
  );
  return { name, dir, version };
};

/**
 * The launcher package: plain Node, with the platform packages as optional dependencies.
 * @param {{ outdir: string; version: string; platforms: ReadonlyArray<Packed> }} input
 * @returns {Packed}
 */
const packLauncher = ({ outdir, version, platforms }) => {
  const name = `${SCOPE}/cli`;
  const dir = path.join(outdir, "cli");
  mkdirSync(dir, { recursive: true });
  for (const name of LAUNCHER_FILES) copyFileSync(launcherFile(name), path.join(dir, name));
  copyFileSync(LICENSE, path.join(dir, "LICENSE"));
  writeJson(path.join(dir, "package.json"), {
    name,
    description:
      "solOS: a Solana execution layer for LLM agents, as one solos binary with the MCP server inside",
    ...shared(version),
    type: "module",
    // The MCP Registry's ownership marker for npm packages; equals `name` in the root server.json.
    mcpName: "io.github.GuiBibeau/solos",
    bin: { solos: "launcher.js" },
    engines: { node: ">=20" },
    files: LAUNCHER_FILES,
    optionalDependencies: Object.fromEntries(platforms.map((pkg) => [pkg.name, version])),
    keywords: KEYWORDS,
  });
  writeFileSync(
    path.join(dir, "README.md"),
    [
      "# @solos-sh/cli",
      "",
      "solOS: a Solana execution layer for LLM agents. One `solos` binary with the MCP server inside.",
      "",
      "```sh",
      "npm i -g @solos-sh/cli   # or: bun add -g @solos-sh/cli",
      "solos login              # connect a wallet, set the RPC URL",
      "solos connect claude     # or codex | cursor: writes the MCP entry",
      "```",
      "",
      `Docs and source: ${REPO}`,
      "",
    ].join("\n"),
  );
  return { name, dir, version };
};

/**
 * @param {{ dist: string; outdir: string; version: string }} input
 * @returns {{ packages: Packed[] }} in publish order: platform packages first, the launcher last,
 *   so the launcher never points at a version npm cannot fetch
 */
export const packNpm = ({ dist, outdir, version }) => {
  if (!SEMVER.test(version)) throw new Error(`version must be a semver string, got ${version}`);
  for (const target of TARGETS) {
    if (!SUPPORTED.includes(target.name)) {
      throw new Error(`the launcher does not know target ${target.name}; add it to SUPPORTED`);
    }
  }
  const platforms = TARGETS.map((target) => packPlatform({ target, dist, outdir, version })).filter(
    (packed) => packed !== null,
  );
  if (platforms.length === 0) throw new Error(`no solos-* binaries found in ${dist}`);
  return { packages: [...platforms, packLauncher({ outdir, version, platforms })] };
};
