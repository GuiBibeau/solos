// @ts-check
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";

const SCRIPT = nodePath.join(import.meta.dir, "check-physical-lines.js");
/** @type {string[]} */
const repos = [];

/** @param {string} cwd @param {...string} args */
export const git = async (cwd, ...args) => {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(stderr);
  return stdout.trim();
};

export const createRepo = async () => {
  const cwd = await mkdtemp(nodePath.join(tmpdir(), "solos-lines-"));
  repos.push(cwd);
  await git(cwd, "init", "-b", "main");
  await git(cwd, "config", "user.email", "lines@example.test");
  await git(cwd, "config", "user.name", "Line Gate Test");
  await writeFile(nodePath.join(cwd, "README.md"), "baseline\n");
  await git(cwd, "add", ".");
  await git(cwd, "commit", "-m", "baseline");
  await git(cwd, "update-ref", "refs/remotes/origin/main", "HEAD");
  await git(cwd, "switch", "-c", "feature");
  return cwd;
};

/** @param {string} cwd @param {string} path @param {number | {count: number, newline: string}} spec */
export const addLines = async (cwd, path, spec) => {
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

/** @param {string} cwd */
export const runCheck = async (cwd) => {
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

/** @param {string} cwd @param {string} path */
export const addLegacyDebt = async (cwd, path) => {
  await git(cwd, "switch", "main");
  await addLines(cwd, path, 151);
  await git(cwd, "update-ref", "refs/remotes/origin/main", "HEAD");
  await git(cwd, "switch", "feature");
  await git(cwd, "rebase", "main");
};

export const cleanupRepos = async () =>
  Promise.all(repos.splice(0).map((path) => rm(path, { recursive: true })));
