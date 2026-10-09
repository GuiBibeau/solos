// @ts-check
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { checksumsText, compileSolos } from "../build/compile.js";
import { smokeTest } from "../build/smoke.js";
import { hostTargetName, selectTargets } from "../build/targets.js";
import { captureCommand } from "../evidence/run-steps.js";
import { emit, exitOnFailure } from "../output.js";

const target = Options.text("target").pipe(
  Options.optional,
  Options.withDescription(
    "darwin-arm64 | darwin-x64 | linux-x64 | linux-arm64 | all. Default: this machine.",
  ),
);
const outdir = Options.text("outdir").pipe(
  Options.withDefault("dist"),
  Options.withDescription("Where the binaries and SHA256SUMS go"),
);
const version = Options.text("version").pipe(
  Options.withDefault("0.0.0"),
  Options.withDescription("Version the binary reports from --version and the MCP serverInfo"),
);
const commit = Options.text("commit").pipe(
  Options.optional,
  Options.withDescription(
    "Commit the binary reports from doctor.release; default: this checkout's HEAD, or null outside one",
  ),
);
const skipSmoke = Options.boolean("skip-smoke").pipe(
  Options.withDescription("Do not run the host binary's smoke test (version, doctor, mcp list)"),
);

/** The commit the build stamps: the one given, else HEAD of the checkout the build runs in. @param {Option.Option<string>} given */
const buildCommit = async (given) => {
  if (Option.isSome(given)) return given.value;
  const { code, stdout, output } = await captureCommand(["git", "rev-parse", "HEAD"]);
  const sha = (stdout ?? output).trim();
  return code === 0 && /^[0-9a-f]{40}$/u.test(sha) ? sha : null;
};

/**
 * `solos dev build`: compile the CLI, with the MCP server inside it, into one executable per
 * target (ADR-0035), stamped with its version and commit (ADR-0036). The host target's binary is then smoke-tested from a neutral directory;
 * cross-compiled binaries cannot run here and are only hashed. Exit 1 when the smoke test fails.
 */
export const build = Command.make("build", { target, outdir, version, commit, skipSmoke }, (o) =>
  Effect.promise(async () => {
    const targets = selectTargets(Option.getOrUndefined(o.target));
    const release = { version: o.version, commit: await buildCommit(o.commit) };
    mkdirSync(o.outdir, { recursive: true });
    const built = [];
    for (const item of targets) {
      built.push(await compileSolos({ target: item, outdir: o.outdir, release }));
    }
    const checksums = path.resolve(o.outdir, "SHA256SUMS");
    writeFileSync(checksums, checksumsText(built));
    const host = built.find((item) => item.name === hostTargetName());
    const smoke = host === undefined || o.skipSmoke ? null : await smokeTest(host.outfile, release);
    if (smoke !== null && !smoke.ok) process.exitCode = 1;
    return { outdir: o.outdir, ...release, built, checksums, smoke };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(
  Command.withDescription(
    "Compile the solos binary (CLI + MCP server) per target and smoke-test it",
  ),
);
