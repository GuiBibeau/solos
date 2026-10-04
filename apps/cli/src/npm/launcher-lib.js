// @ts-check
/**
 * What the `solos` bin of the npm launcher package `@solos-sh/cli` does: run the compiled binary
 * from the platform package npm installed as an optional dependency (`@solos-sh/cli-<os>-<cpu>`),
 * relaying stdio and the exit code, so `npm i -g @solos-sh/cli` and `npx @solos-sh/cli` work on
 * machines without Bun (ADR-0035). Plain Node and nothing from the repo: npm runs these files as
 * they are. `launcher.js` is the bin; this module is the logic, kept apart so it can be tested.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

export const SCOPE = "@solos-sh";
/** The platforms a release ships; `solos dev pack` refuses a target this list does not know. */
export const SUPPORTED = Object.freeze(["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]);

/**
 * The platform package for a machine, or null when no binary is built for it.
 * @param {string} platform @param {string} arch
 */
export const platformPackage = (platform, arch) => {
  const name = `${platform}-${arch}`;
  return SUPPORTED.includes(name) ? `${SCOPE}/cli-${name}` : null;
};

/**
 * The binary inside the installed platform package, or null when npm skipped the optional
 * dependency (`--no-optional`, or an install copied between machines).
 * @param {string} pkg
 * @param {(specifier: string) => string} [resolve]
 */
export const binaryPath = (pkg, resolve = createRequire(import.meta.url).resolve) => {
  try {
    return path.join(path.dirname(resolve(`${pkg}/package.json`)), "bin", "solos");
  } catch {
    return null;
  }
};

/** @param {string} platform @param {string} arch @param {string | null} pkg */
const explain = (platform, arch, pkg) =>
  pkg === null
    ? `solos: no binary is built for ${platform}-${arch}; supported: ${SUPPORTED.join(", ")}.\n`
    : `solos: ${pkg} is not installed; reinstall @solos-sh/cli without --no-optional, or use the install script from the repository.\n`;

/**
 * Run the binary with the launcher's arguments and return its exit code. A child killed by a
 * signal re-raises that signal here so the parent shell sees the same outcome.
 * @param {string[]} [argv]
 */
export const run = (argv = process.argv.slice(2)) => {
  const pkg = platformPackage(process.platform, process.arch);
  const binary = pkg === null ? null : binaryPath(pkg);
  if (binary === null) {
    process.stderr.write(explain(process.platform, process.arch, pkg));
    return 1;
  }
  const result = spawnSync(binary, argv, { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`solos: cannot start ${binary}: ${result.error.message}\n`);
    return 1;
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return 1;
  }
  return result.status ?? 1;
};
