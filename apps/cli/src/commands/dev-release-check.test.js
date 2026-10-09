// @ts-check
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSolos, stderrJson } from "./cli-fixture.js";

const env = { SOLOS_DEV: "1" };
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };

/** A checkout with one commit and, when given, a `solos@<version>` tag: the history check reads. @param {string} prefix @param {string | null} version */
const releasedRepo = (prefix, version) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, { cwd: dir, stdio: "ignore", env: GIT_ENV });
  git(["init", "-q"]);
  git([
    "-c",
    "user.name=solos",
    "-c",
    "user.email=solos@example.com",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "base",
  ]);
  if (version !== null) git(["tag", `solos@${version}`]);
  return dir;
};

describe("solos dev release check [integration]", () => {
  test("check names what a release PR still lacks, from a cwd holding its own server.json", async () => {
    const dir = releasedRepo("solos-check-", "0.0.9");
    const manifest = { version: "0.1.0", packages: [{ version: "0.1.0" }] };
    writeFileSync(path.join(dir, "server.json"), JSON.stringify(manifest));
    const lacking = await runSolos(["dev", "release", "check", "--branch", "release/0.1.0"], env, {
      cwd: dir,
    });
    expect(lacking.code).toBe(1);
    const report = JSON.parse(lacking.stdout);
    expect(report.version).toBe("0.1.0");
    expect(report.problems.map((/** @type {{ reason: string }} */ p) => p.reason)).toEqual([
      "docs/releases/0.1.0.md is missing",
    ]);
    mkdirSync(path.join(dir, "docs", "releases"), { recursive: true });
    writeFileSync(path.join(dir, "docs", "releases", "0.1.0.md"), "# solos 0.1.0\n");
    const complete = await runSolos(["dev", "release", "check", "--branch", "release/0.1.0"], env, {
      cwd: dir,
    });
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
    const dir = releasedRepo("solos-check-bad-", "0.0.9");
    writeFileSync(path.join(dir, "server.json"), "{ not json");
    const { stdout, code } = await runSolos(
      ["dev", "release", "check", "--branch", "release/0.1.0"],
      env,
      { cwd: dir },
    );
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.ok).toBe(false);
    expect(report.problems[0]?.reason).toStartWith("server.json is not valid JSON");
    rmSync(dir, { recursive: true, force: true });
  });

  test("check derives its history from the solos@ tags and takes no override", async () => {
    const dir = releasedRepo("solos-check-untagged-", null);
    writeFileSync(path.join(dir, "server.json"), "{}");
    const untagged = await runSolos(["dev", "release", "check", "--branch", "release/0.1.0"], env, {
      cwd: dir,
    });
    expect(untagged.code).toBe(1);
    expect(stderrJson(untagged.stderr)).toEqual({
      error: {
        code: "ReleaseRefused",
        reason: "no solos@<semver> tag is reachable",
        remedy: "git fetch --tags so the newest stable release is reachable",
      },
    });
    const overridden = await runSolos(
      ["dev", "release", "check", "--branch", "release/0.1.0", "--base", "0.0.9"],
      env,
      { cwd: dir },
    );
    expect(overridden.code).not.toBe(0);
    expect(`${overridden.stdout}${overridden.stderr}`).toContain("unknown argument: '--base'");
    rmSync(dir, { recursive: true, force: true });
  });
});
