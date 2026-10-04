// @ts-check
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { packNpm } from "../build/npm-pack.js";
import { emit, exitOnFailure } from "../output.js";

const dist = Options.text("dist").pipe(
  Options.withDefault("dist"),
  Options.withDescription("Where `solos dev build` put the solos-<platform> binaries"),
);
const outdir = Options.text("outdir").pipe(
  Options.withDefault("dist/npm"),
  Options.withDescription("Where the package directories go"),
);
const version = Options.text("version").pipe(
  Options.withDescription("The release version every package carries, e.g. 0.1.0"),
);

/**
 * `solos dev pack`: assemble the npm packages for a release from built binaries (ADR-0035). The
 * output lists the package directories in publish order; the release workflow publishes each.
 */
export const pack = Command.make("pack", { dist, outdir, version }, (o) =>
  Effect.try(() => packNpm({ dist: o.dist, outdir: o.outdir, version: o.version })).pipe(
    Effect.map((result) => ({ ...result, version: o.version, outdir: o.outdir })),
    Effect.flatMap(emit),
    exitOnFailure,
  ),
).pipe(
  Command.withDescription("Assemble the npm launcher and platform packages from built binaries"),
);
