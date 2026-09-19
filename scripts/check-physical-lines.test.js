// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";

const SCRIPT = nodePath.join(import.meta.dir, "check-physical-lines.js");
/** @type {string[]} */
const repos = [];

const git = async (cwd, ...args) => {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(stderr);
  return stdout.trim();
};

const repo = async () => {
  const cwd = await mkdtemp(nodePath.join(tmpdir(), "solos-lines-"));
  repos.push(cwd);
  await git(cwd, "init", "-b", "main");
  await git(cwd, "config", "user.email", "lines@example.test");
  await git(cwd, "config", "user.name", "Line Gate Test");
  await writeFile(nodePath.join(cwd, "README.md"), "baseline\n");
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-m", "baseline");
  await git(cwd, "update-ref", "refs/remotes/origin/main", "HEAD");
  await git(cwd, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  await git(cwd, "switch", "-c", "feature");
  return cwd;
};

const addLines = async (cwd, path, spec) => {
  const count = typeof spec === "number" ? spec : spec.count;
  const newline = typeof spec === "number" ? "\n" : spec.newline;
  await mkdir(nodePath.join(cwd, path, ".."), { recursive: true });
  await writeFile(
    nodePath.join(cwd, path),
    Array.from({ length: count }, (_, i) => `// ${i}`).join(newline),
  );
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-m", `add ${path}`);
};

const check = async (cwd) => {
  const proc = Bun.spawn([process.execPath, "run", SCRIPT], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

const addLegacyDebt = async (cwd, path) => {
  await git(cwd, "switch", "main");
  await addLines(cwd, path, 151);
  await git(cwd, "update-ref", "refs/remotes/origin/main", "HEAD");
  await git(cwd, "switch", "feature");
  await git(cwd, "rebase", "main");
};

afterEach(async () => Promise.all(repos.splice(0).map((path) => rm(path, { recursive: true }))));

describe("physical line gate [integration]", () => {
  test("accepts 150 physical comment lines and rejects 151", async () => {
    const passing = await repo();
    await addLines(passing, "src/exact.test.js", 150);
    expect((await check(passing)).code).toBe(0);

    const failing = await repo();
    await addLines(failing, "src/too-long.test.js", 151);
    const result = await check(failing);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("src/too-long.test.js: 151 physical lines (maximum 150)");
  });

  test("counts CRLF and a missing terminal newline for paths with spaces", async () => {
    const cwd = await repo();
    await addLines(cwd, "src/path with spaces.js", { count: 151, newline: "\r\n" });
    const result = await check(cwd);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("src/path with spaces.js: 151 physical lines");
  });

  test("reports untouched legacy debt without blocking the change", async () => {
    const cwd = await repo();
    await addLegacyDebt(cwd, "src/legacy.js");
    await addLines(cwd, "src/small.js", 2);
    const result = await check(cwd);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("debt: src/legacy.js: 151 physical lines");
    expect(result.stderr).toContain("untouchedDebt=1");
  });

  test("blocks touched and renamed legacy violations", async () => {
    const modified = await repo();
    await addLegacyDebt(modified, "src/legacy.js");
    await writeFile(nodePath.join(modified, "src/legacy.js"), "// changed\n".repeat(151));
    await git(modified, "add", ".");
    await git(modified, "commit", "-m", "touch legacy");
    expect((await check(modified)).code).toBe(1);

    const renamed = await repo();
    await addLegacyDebt(renamed, "src/legacy.js");
    await git(renamed, "mv", "src/legacy.js", "src/renamed.js");
    await git(renamed, "commit", "-m", "rename legacy");
    expect((await check(renamed)).code).toBe(1);
  });

  test("reports a touched approved exception", async () => {
    const cwd = await repo();
    await addLines(cwd, "eslint.config.js", 151);
    const result = await check(cwd);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("approvedException=eslint.config.js:151");
  });

  test("fails clearly when the comparison base is unavailable", async () => {
    const cwd = await repo();
    await git(cwd, "update-ref", "-d", "refs/remotes/origin/main");
    const result = await check(cwd);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cannot resolve comparison base");
  });

  test("includes uncommitted added files", async () => {
    const cwd = await repo();
    await addLines(cwd, "src/small.js", 2);
    await writeFile(nodePath.join(cwd, "src/uncommitted.js"), "// line\n".repeat(151));
    const result = await check(cwd);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("src/uncommitted.js: 151 physical lines");
  });
});
