// @ts-check
/**
 * One `Bun.build({ compile })` per target, with the plugins the dependency tree needs and the
 * autoloads an installed binary must not have: no `.env` from the cwd (ADR-0015: explicit env
 * or a profile), no `bunfig.toml`. The version and the commit are defined into the bundle so
 * `solos --version`, the MCP `serverInfo` and `doctor.release` report the release (ADR-0035,
 * ADR-0036).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_PLUGINS } from "./plugins.js";

/** @typedef {import("./targets.js").BuildTarget} BuildTarget */
/** @typedef {{ name: string; outfile: string; bytes: number; sha256: string }} Built */

export const CLI_ENTRY = fileURLToPath(new URL("../main.js", import.meta.url));

/** @param {string} path */
const sha256Of = async (path) => {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
};

/** @typedef {{ version: string; commit: string | null }} Release */

/**
 * @param {{ target: BuildTarget; outdir: string; release: Release }} input
 * @returns {Promise<Built>}
 */
export const compileSolos = async ({ target, outdir, release }) => {
  // Absolute, because the smoke test runs the binary from a neutral working directory.
  const outfile = path.resolve(outdir, target.binary);
  const result = await Bun.build({
    entrypoints: [CLI_ENTRY],
    target: "bun",
    define: {
      "process.env.SOLOS_VERSION": JSON.stringify(release.version),
      "process.env.SOLOS_COMMIT": JSON.stringify(release.commit),
    },
    plugins: [...BUILD_PLUGINS],
    compile: { target: target.target, outfile, autoloadDotenv: false, autoloadBunfig: false },
  });
  if (!result.success) {
    throw new Error(`build failed for ${target.name}: ${result.logs.map(String).join("\n")}`);
  }
  return {
    name: target.name,
    outfile,
    bytes: Bun.file(outfile).size,
    sha256: await sha256Of(outfile),
  };
};

/**
 * The `SHA256SUMS` body, in the `sha256sum -c` shape a release consumer verifies with.
 * @param {ReadonlyArray<Built>} built
 */
export const checksumsText = (built) =>
  `${built.map((item) => `${item.sha256}  ${path.basename(item.outfile)}`).join("\n")}\n`;
