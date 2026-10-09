// @ts-check
import { describe, expect, test } from "bun:test";
import { runSolos, stderrJson } from "./cli-fixture.js";

const env = { SOLOS_DEV: "1" };

describe("solos dev release", () => {
  test("version derives a canary from a base without touching npm", async () => {
    const { stdout, code } = await runSolos(
      [
        "dev",
        "release",
        "version",
        "--lane",
        "canary",
        "--run",
        "7",
        "--sha",
        "1f232a4abcdef",
        "--base",
        "0.1.0",
      ],
      env,
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      version: "0.1.1-canary.7.g1f232a4",
      lane: "canary",
      tag: "solos@0.1.1-canary.7.g1f232a4",
      base: "0.1.0",
      major: false,
    });
  });

  test("version refuses a canary without a run number, naming the flag", async () => {
    const { stderr, code } = await runSolos(
      ["dev", "release", "version", "--lane", "canary", "--sha", "1f232a4", "--base", "0.1.0"],
      env,
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)).toEqual({
      error: {
        code: "ReleaseRefused",
        reason: "--run is required for this lane",
        remedy: "pass --run",
      },
    });
  });

  test("check reads the branch and names what a release PR still lacks", async () => {
    const { stdout, code } = await runSolos(
      ["dev", "release", "check", "--branch", "release/0.1.0"],
      env,
    );
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.version).toBe("0.1.0");
    expect(report.ok).toBe(false);
    expect(report.problems.map((/** @type {{ reason: string }} */ p) => p.reason)).toEqual([
      "docs/releases/0.1.0.md is missing",
    ]);
  });

  test("promote --dry-run prints the exact commands and runs none", async () => {
    const { stdout, code } = await runSolos(
      ["dev", "release", "promote", "9.9.9", "--dry-run", "--skip-registry"],
      env,
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.steps.map((/** @type {{ command: string }} */ s) => s.command)).toEqual([
      "npm dist-tag add @solos-sh/cli@9.9.9 latest",
      "npm dist-tag add @solos-sh/cli-darwin-arm64@9.9.9 latest",
      "npm dist-tag add @solos-sh/cli-darwin-x64@9.9.9 latest",
      "npm dist-tag add @solos-sh/cli-linux-x64@9.9.9 latest",
      "npm dist-tag add @solos-sh/cli-linux-arm64@9.9.9 latest",
      "gh release edit solos@9.9.9 --latest --prerelease=false",
    ]);
    expect(result.steps.every((/** @type {{ ok: unknown }} */ s) => s.ok === null)).toBe(true);
  });

  test("rollback refuses when latest already points at the target", async () => {
    const { stderr, code } = await runSolos(
      ["dev", "release", "rollback", "--to", "0.1.0", "--from", "0.1.0", "--dry-run"],
      env,
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "ReleaseRefused",
      reason: "latest already points at 0.1.0",
    });
  });
});
