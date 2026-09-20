// @ts-check
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** @type {string[]} */
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

/** @param {string} cwd @param {string[]} args */
const run = (cwd, args) => {
  const result = Bun.spawnSync(args, { cwd, stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
};

/** @param {string} cwd @param {string} text */
const commit = (cwd, text) => {
  writeFileSync(path.join(cwd, "tracked.txt"), text);
  run(cwd, ["git", "add", "tracked.txt"]);
  run(cwd, ["git", "commit", "-m", text]);
  return run(cwd, ["git", "rev-parse", "HEAD"]);
};

const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), "factory-session-sync-"));
  roots.push(root);
  const remote = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  const station = path.join(root, "station");
  run(root, ["git", "init", "--bare", "--initial-branch=main", remote]);
  run(root, ["git", "init", "--initial-branch=main", seed]);
  run(seed, ["git", "config", "user.name", "Factory Test"]);
  run(seed, ["git", "config", "user.email", "factory@example.com"]);
  run(seed, ["git", "remote", "add", "origin", remote]);
  commit(seed, "first");
  run(seed, ["git", "push", "-u", "origin", "main"]);
  run(root, ["git", "clone", remote, station]);
  run(station, ["git", "config", "user.name", "Factory Test"]);
  run(station, ["git", "config", "user.email", "factory@example.com"]);
  return { remote, seed, station };
};

/** @param {string} station @param {string} remote */
const sync = (station, remote) =>
  run(station, ["bash", path.join(import.meta.dir, "factory-session-sync.sh"), remote]);

test("session sync fast-forwards a clean default branch", () => {
  const { remote, seed, station } = fixture();
  const remoteHead = commit(seed, "second");
  run(seed, ["git", "push", "origin", "main"]);
  sync(station, remote);
  expect(run(station, ["git", "rev-parse", "HEAD"])).toBe(remoteHead);
});

test("session sync preserves feature branch bytes and dirty status", () => {
  const { remote, station } = fixture();
  run(station, ["git", "switch", "-c", "factory/test"]);
  writeFileSync(path.join(station, "tracked.txt"), "unsaved\n");
  const before = readFileSync(path.join(station, "tracked.txt"), "utf8");
  sync(station, remote);
  expect(readFileSync(path.join(station, "tracked.txt"), "utf8")).toBe(before);
  expect(run(station, ["git", "branch", "--show-current"])).toBe("factory/test");
  expect(run(station, ["git", "status", "--porcelain"])).not.toBe("");
});

test("session sync preserves unpushed commits when main diverges", () => {
  const { remote, seed, station } = fixture();
  commit(seed, "remote-second");
  run(seed, ["git", "push", "origin", "main"]);
  const localHead = commit(station, "local-second");
  sync(station, remote);
  expect(run(station, ["git", "rev-parse", "HEAD"])).toBe(localHead);
});
