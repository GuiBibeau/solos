// @ts-check
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runSolos, stderrJson } from "./cli-fixture.js";
import { gitIn, releasedRepo } from "./release-fixture.js";

const env = { SOLOS_DEV: "1" };
const manifest = JSON.stringify(
  { name: "io.github.GuiBibeau/solos", version: "0.0.9", packages: [{ version: "0.0.9" }] },
  null,
  2,
);

describe("solos dev release prepare [integration]", () => {
  test("a patch bump branches, moves both manifest versions, writes the notes, commits, and passes check", async () => {
    const dir = releasedRepo("solos-prepare-", "0.0.9", { manifest: `${manifest}\n` });
    gitIn(dir, ["commit", "-q", "--allow-empty", "-m", "feat(swap): a change since the tag"]);
    const dry = await runSolos(["dev", "release", "prepare", "--bump", "patch", "--dry-run"], env, {
      cwd: dir,
    });
    expect(dry.code).toBe(0);
    expect(JSON.parse(dry.stdout)).toMatchObject({
      version: "0.0.10",
      branch: "release/0.0.10",
      previous: "0.0.9",
      major: false,
      dryRun: true,
      pr: null,
    });
    expect(existsSync(path.join(dir, "docs", "releases", "0.0.10.md"))).toBe(false);

    const { stdout, code } = await runSolos(
      ["dev", "release", "prepare", "--bump", "patch", "--no-pr"],
      env,
      { cwd: dir },
    );
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report).toMatchObject({ version: "0.0.10", branch: "release/0.0.10", pr: null });
    expect(report.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(gitIn(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe("release/0.0.10");
    const bumped = JSON.parse(readFileSync(path.join(dir, "server.json"), "utf8"));
    expect([bumped.version, bumped.packages[0].version]).toEqual(["0.0.10", "0.0.10"]);
    const notes = readFileSync(path.join(dir, "docs", "releases", "0.0.10.md"), "utf8");
    expect(notes).toContain("a change since the tag");
    expect(gitIn(dir, ["show", "--stat", "--format=", "HEAD"])).toContain("server.json");
    expect(gitIn(dir, ["status", "--porcelain"]).trim()).toBe("");

    const checked = await runSolos(["dev", "release", "check", "--branch", "release/0.0.10"], env, {
      cwd: dir,
    });
    expect(checked.code).toBe(0);
    expect(JSON.parse(checked.stdout)).toMatchObject({ ok: true, version: "0.0.10", problems: [] });
    rmSync(dir, { recursive: true, force: true });
  });

  test("a dirty tree is refused before anything moves", async () => {
    const dir = releasedRepo("solos-prepare-dirty-", "0.0.9", { manifest: `${manifest}\n` });
    writeFileSync(path.join(dir, "scratch.txt"), "uncommitted\n");
    const { stderr, code } = await runSolos(
      ["dev", "release", "prepare", "--bump", "minor", "--no-pr"],
      env,
      { cwd: dir },
    );
    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "ReleaseRefused",
      reason: "the working tree has uncommitted changes",
    });
    expect(gitIn(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe("main");
    rmSync(dir, { recursive: true, force: true });
  });
});
