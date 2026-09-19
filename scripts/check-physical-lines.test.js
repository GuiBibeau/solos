// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import nodePath from "node:path";
import {
  addLegacyDebt,
  addLines,
  cleanupRepos,
  createRepo,
  git,
  runCheck,
} from "./physical-lines-fixture.js";

afterEach(cleanupRepos);

describe("physical line gate [integration]", () => {
  test("accepts 150 physical comment lines and rejects 151", async () => {
    const passing = await createRepo();
    await addLines(passing, "src/exact.test.js", 150);
    expect((await runCheck(passing)).code).toBe(0);

    const failing = await createRepo();
    await addLines(failing, "src/too-long.test.js", 151);
    const result = await runCheck(failing);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("src/too-long.test.js: 151 physical lines (maximum 150)");
  });

  test("counts CRLF and a missing terminal newline for paths with spaces", async () => {
    const cwd = await createRepo();
    await addLines(cwd, "src/path with spaces.js", { count: 151, newline: "\r\n" });
    const result = await runCheck(cwd);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("src/path with spaces.js: 151 physical lines");
  });

  test("reports untouched legacy debt without blocking the change", async () => {
    const cwd = await createRepo();
    await addLegacyDebt(cwd, "src/legacy.js");
    await addLines(cwd, "src/small.js", 2);
    const result = await runCheck(cwd);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("debt: src/legacy.js: 151 physical lines");
    expect(result.stderr).toContain("untouchedDebt=1");
  });

  test("blocks touched and renamed legacy violations", async () => {
    const modified = await createRepo();
    await addLegacyDebt(modified, "src/legacy.js");
    await writeFile(nodePath.join(modified, "src/legacy.js"), "// changed\n".repeat(151));
    await git(modified, "add", ".");
    await git(modified, "commit", "-m", "touch legacy");
    expect((await runCheck(modified)).code).toBe(1);

    const renamed = await createRepo();
    await addLegacyDebt(renamed, "src/legacy.js");
    await git(renamed, "mv", "src/legacy.js", "src/renamed.js");
    await git(renamed, "commit", "-m", "rename legacy");
    expect((await runCheck(renamed)).code).toBe(1);
  });

  test("reports a touched approved exception", async () => {
    const cwd = await createRepo();
    await addLines(cwd, "eslint.config.js", 151);
    const result = await runCheck(cwd);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("approvedException=eslint.config.js:151");
  });

  test("fails clearly when the comparison base is unavailable", async () => {
    const cwd = await createRepo();
    await git(cwd, "update-ref", "-d", "refs/remotes/origin/main");
    const result = await runCheck(cwd);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cannot resolve comparison base");
  });

  test("includes uncommitted added files", async () => {
    const cwd = await createRepo();
    await addLines(cwd, "src/small.js", 2);
    await writeFile(nodePath.join(cwd, "src/uncommitted.js"), "// line\n".repeat(151));
    const result = await runCheck(cwd);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("src/uncommitted.js: 151 physical lines");
  });
});
