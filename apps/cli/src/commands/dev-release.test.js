// @ts-check
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSolos, stderrJson } from "./cli-fixture.js";

const env = { SOLOS_DEV: "1" };

describe("solos dev release [integration]", () => {
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

  test("version refuses a prerelease --base", async () => {
    const { stderr, code } = await runSolos(
      [
        "dev",
        "release",
        "version",
        "--lane",
        "stable",
        "--bump",
        "patch",
        "--base",
        "0.1.1-canary.7.g1f232a4",
      ],
      env,
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "ReleaseRefused",
      reason: "--base 0.1.1-canary.7.g1f232a4 is not a stable semver version",
    });
  });

  test("rollback refuses an empty reason, which npm would read as un-deprecating", async () => {
    const { stderr, code } = await runSolos(
      [
        "dev",
        "release",
        "rollback",
        "--to",
        "0.1.0",
        "--from",
        "0.1.1",
        "--reason",
        "",
        "--dry-run",
      ],
      env,
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "ReleaseRefused" });
    expect(stderrJson(stderr)?.error.reason).toContain("--reason is empty");
  });

  test("check names what a release PR still lacks, from a cwd holding its own server.json", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "solos-check-"));
    const manifest = { version: "0.1.0", packages: [{ version: "0.1.0" }] };
    writeFileSync(path.join(dir, "server.json"), JSON.stringify(manifest));
    const lacking = await runSolos(
      ["dev", "release", "check", "--branch", "release/0.1.0", "--base", "0.0.9"],
      env,
      {
        cwd: dir,
      },
    );
    expect(lacking.code).toBe(1);
    const report = JSON.parse(lacking.stdout);
    expect(report.version).toBe("0.1.0");
    expect(report.problems.map((/** @type {{ reason: string }} */ p) => p.reason)).toEqual([
      "docs/releases/0.1.0.md is missing",
    ]);
    mkdirSync(path.join(dir, "docs", "releases"), { recursive: true });
    writeFileSync(path.join(dir, "docs", "releases", "0.1.0.md"), "# solos 0.1.0\n");
    const complete = await runSolos(
      ["dev", "release", "check", "--branch", "release/0.1.0", "--base", "0.0.9"],
      env,
      {
        cwd: dir,
      },
    );
    expect(complete.code).toBe(0);
    expect(JSON.parse(complete.stdout)).toMatchObject({
      ok: true,
      version: "0.1.0",
      major: false,
      problems: [],
    });
    rmSync(dir, { recursive: true, force: true });
  });

  test("check reports a malformed server.json as a problem, not an internal error", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "solos-check-bad-"));
    writeFileSync(path.join(dir, "server.json"), "{ not json");
    const { stdout, code } = await runSolos(
      ["dev", "release", "check", "--branch", "release/0.1.0", "--base", "0.0.9"],
      env,
      { cwd: dir },
    );
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
    expect(report.problems[0]?.reason).toStartWith("server.json is not valid JSON");
    rmSync(dir, { recursive: true, force: true });
  });

  test("notes --out creates the parent directory", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "solos-notes-"));
    const out = path.join(dir, "docs", "releases", "0.1.1.md");
    const { code } = await runSolos(
      ["dev", "release", "notes", "0.1.1", "--since", "solos@0.1.0", "--out", out],
      env,
    );
    expect(code).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("# solos 0.1.1");
    rmSync(dir, { recursive: true, force: true });
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

  test("promote --dry-run names the tag whose manifest the registry publish would use", async () => {
    const { stdout, code } = await runSolos(
      ["dev", "release", "promote", "9.9.9", "--dry-run"],
      env,
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.steps[0]?.command).toBe("mcp-publisher validate");
    expect(result.steps.at(-1)?.name).toBe("MCP Registry publish from solos@9.9.9");
    expect(result.registry).toMatchObject({ publish: true });
  });

  test("promote refuses a canary: latest only ever points at a stable version", async () => {
    const { stderr, code } = await runSolos(
      ["dev", "release", "promote", "0.1.1-canary.7.g1f232a4", "--dry-run"],
      env,
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "ReleaseRefused",
      reason:
        "version 0.1.1-canary.7.g1f232a4 is a prerelease; latest only ever points at a stable version",
    });
  });

  test("rollback --dry-run deprecates after the flips and says the registry is fix-forward", async () => {
    const { stdout, code } = await runSolos(
      ["dev", "release", "rollback", "--to", "0.1.0", "--from", "0.1.1", "--dry-run"],
      env,
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.steps).toHaveLength(11);
    expect(
      result.steps.some((/** @type {{ command: string }} */ s) =>
        s.command.startsWith("mcp-publisher"),
      ),
    ).toBe(false);
    expect(result.registry).toMatchObject({ changed: false });
    expect(result.registry.remedy).toContain("fix forward");
  });

  test("rollback refuses a target that is not older than the source", async () => {
    const { stderr, code } = await runSolos(
      ["dev", "release", "rollback", "--to", "0.2.0", "--from", "0.1.0", "--dry-run"],
      env,
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error.reason).toBe(
      "--to 0.2.0 is not older than --from 0.1.0; a rollback restores a previous release",
    );
  });

  test("rollback refuses a prerelease --from: the stable lane never rolls back from a canary", async () => {
    const { stderr, code } = await runSolos(
      [
        "dev",
        "release",
        "rollback",
        "--to",
        "0.1.0",
        "--from",
        "0.1.1-canary.7.g1f232a4",
        "--dry-run",
      ],
      env,
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error.reason).toContain(
      "--from 0.1.1-canary.7.g1f232a4 is a prerelease",
    );
  });

  test("rollback requires --from, so a retry never mistakes the target for the source", async () => {
    const { code, stderr } = await runSolos(
      ["dev", "release", "rollback", "--to", "0.1.0", "--dry-run"],
      env,
    );
    expect(code).not.toBe(0);
    expect(stderr).toContain("--from");
  });

  test("rollback refuses when latest already points at the target", async () => {
    const { stderr, code } = await runSolos(
      ["dev", "release", "rollback", "--to", "0.1.0", "--from", "0.1.0", "--dry-run"],
      env,
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "ReleaseRefused" });
    expect(stderrJson(stderr)?.error.reason).toContain("is not older than");
  });
});
