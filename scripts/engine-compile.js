// @ts-check
/**
 * Compile `solos-engine`. Same flags as:
 * `bun build --compile --target=bun-linux-x64|bun-linux-arm64 --no-compile-autoload-dotenv
 * --define process.env.SOLOS_VERSION=<semver> [--feature=<NAME>...]`.
 * The CLI form dies on the empty `@solana/rpc-parsed-types` module, so this uses the plugins
 * `solos dev build` already needs.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BUILD_PLUGINS } from "../apps/cli/src/build/plugins.js";

const ENTRY = path.join(import.meta.dir, "../apps/engine/src/main.js");

/** @typedef {"linux-x64" | "linux-arm64"} EngineTarget */

/**
 * @param {EngineTarget} target
 * @param {string} outfile
 * @param {{ version: string; features: ReadonlyArray<string> }} release
 */
const compileEngineTarget = async (target, outfile, release) => {
  const result = await Bun.build({
    entrypoints: [ENTRY],
    target: "bun",
    define: { "process.env.SOLOS_VERSION": JSON.stringify(release.version) },
    features: [...release.features],
    plugins: [...BUILD_PLUGINS],
    compile: {
      target: `bun-${target}`,
      outfile,
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
  });
  if (!result.success) throw new Error(result.logs.map(String).join("\n"));
  return outfile;
};

/** @param {string | undefined} raw */
const featureList = (raw) =>
  (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

/** @param {string} name @returns {name is EngineTarget} */
const isTarget = (name) => name === "linux-x64" || name === "linux-arm64";

/** @param {string | undefined} raw */
const targetList = (raw) => {
  const names = (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) throw new Error("ENGINE_TARGETS is empty");
  const unknown = names.find((name) => !isTarget(name));
  if (unknown !== undefined) throw new Error(`unknown engine target ${unknown}`);
  return names.filter(isTarget);
};

const releaseFromEnv = () => {
  const version = process.env.ENGINE_VERSION;
  if (version === undefined || version.length === 0) throw new Error("ENGINE_VERSION is not set");
  const outdir = process.env.ENGINE_OUTDIR;
  if (outdir === undefined || outdir.length === 0) throw new Error("ENGINE_OUTDIR is not set");
  return {
    version,
    outdir,
    features: featureList(process.env.ENGINE_FEATURES),
    targets: targetList(process.env.ENGINE_TARGETS),
  };
};

const main = async () => {
  const release = releaseFromEnv();
  mkdirSync(release.outdir, { recursive: true });
  for (const target of release.targets) {
    const outfile = path.resolve(release.outdir, `solos-engine-${target}`);
    await compileEngineTarget(target, outfile, release);
    process.stdout.write(`${outfile}\n`);
  }
};

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
