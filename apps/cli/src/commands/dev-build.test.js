// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSolos } from "./cli-fixture.js";

const VERSION = "0.0.0-test";
/** @type {string} */
let outdir = "";
/** @type {{ stdout: string; stderr: string; code: number }} */
let result = { stdout: "", stderr: "", code: -1 };

/** One build for the whole suite: it writes an executable of tens of megabytes. */
beforeAll(async () => {
  outdir = await mkdtemp(path.join(tmpdir(), "solos-dev-build-"));
  result = await runSolos(["dev", "build", "--outdir", outdir, "--version", VERSION], {
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
    expect(report.built).toHaveLength(1);
    expect(report.built[0].name).toBe(`${process.platform}-${process.arch}`);
    expect(report.built[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.built[0].bytes).toBeGreaterThan(10_000_000);
    expect(report.smoke.ok).toBe(true);
    expect(report.smoke.checks.map((/** @type {{ name: string }} */ c) => c.name)).toEqual([
      "version",
      "doctor",
      "mcp list",
    ]);
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
      expect(doctor.rpcOrigin).toBeNull();
      expect(doctor.issues.map((/** @type {{ code: string }} */ i) => i.code)).toContain(
        "RpcConfigMissing",
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
