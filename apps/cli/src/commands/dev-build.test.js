// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ROOT, runSolos, stderrJson } from "./cli-fixture.js";

/** A canary, so the smoke test proves the lane is read from the version (ADR-0036). */
const VERSION = "0.1.1-canary.7.g1f232a4";
/**
 * A relative outdir, as the documented `bun run solos dev build` leaves it: the smoke test runs
 * the binary from a neutral directory, so the build must resolve the path before handing it over.
 * `dist/` is gitignored.
 */
const RELATIVE_OUTDIR = path.join("dist", `test-build-${process.pid}`);
const outdir = path.join(ROOT, RELATIVE_OUTDIR);
/** @type {{ stdout: string; stderr: string; code: number }} */
let result = { stdout: "", stderr: "", code: -1 };

/** One build for the whole suite: it writes an executable of tens of megabytes. */
beforeAll(async () => {
  result = await runSolos(["dev", "build", "--outdir", RELATIVE_OUTDIR, "--version", VERSION], {
    SOLOS_DEV: "1",
  });
}, 120_000);

afterAll(async () => {
  await rm(outdir, { recursive: true, force: true });
});

describe("solos dev build compiles one binary and proves it runs [integration]", () => {
  test("the host target compiles, is hashed, and passes its smoke test", () => {
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.version).toBe(VERSION);
    expect(report.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(report.built).toHaveLength(1);
    expect(report.built[0].name).toBe(`${process.platform}-${process.arch}`);
    expect(report.built[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.built[0].bytes).toBeGreaterThan(10_000_000);
    expect(path.isAbsolute(report.built[0].outfile)).toBe(true);
    expect(report.built[0].outfile).toBe(
      path.join(outdir, report.built[0].name.replace(/^/, "solos-")),
    );
    expect(report.smoke.ok).toBe(true);
    expect(report.smoke.checks.map((/** @type {{ name: string }} */ c) => c.name)).toEqual([
      "version",
      "doctor",
      "mcp list",
    ]);
  });

  test("an explicit --commit must be a full lowercase sha, refused before anything compiles", async () => {
    const { stderr, code } = await runSolos(
      ["dev", "build", "--outdir", RELATIVE_OUTDIR, "--commit", "typo", "--skip-smoke"],
      { SOLOS_DEV: "1" },
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)).toEqual({
      error: {
        code: "ReleaseRefused",
        reason: "--commit typo is not a full lowercase commit sha",
        remedy:
          "pass the 40 hex characters of git rev-parse HEAD, or omit --commit to stamp this checkout's HEAD",
      },
    });
  });

  test("SHA256SUMS lists the binary in sha256sum -c form", async () => {
    const report = JSON.parse(result.stdout);
    const sums = await readFile(path.join(outdir, "SHA256SUMS"), "utf8");
    expect(sums).toBe(`${report.built[0].sha256}  ${path.basename(report.built[0].outfile)}\n`);
  });

  test("the binary reads no .env from its working directory", async () => {
    const report = JSON.parse(result.stdout);
    const cwd = await mkdtemp(path.join(tmpdir(), "solos-binary-cwd-"));
    try {
      await Bun.write(path.join(cwd, ".env"), 'SOLANA_RPC_URL="https://ambient.invalid"\n');
      const proc = Bun.spawn([report.built[0].outfile, "doctor"], {
        cwd,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", SOLOS_CONFIG_DIR: cwd },
        stdout: "pipe",
        stderr: "ignore",
      });
      const doctor = JSON.parse(await new Response(proc.stdout).text());
      expect(doctor.release).toEqual({ version: VERSION, lane: "canary", commit: report.commit });
      expect(doctor.rpcOrigin).toBeNull();
      expect(doctor.issues.map((/** @type {{ code: string }} */ i) => i.code)).toContain(
        "RpcConfigMissing",
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
