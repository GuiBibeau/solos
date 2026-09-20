// @ts-check
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sessionSyncCommand } from "./session-sync-command.js";

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
  run(cwd, ["git", "add", "."]);
  run(cwd, ["git", "commit", "-m", text]);
  return run(cwd, ["git", "rev-parse", "HEAD"]);
};

const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), "factory-session-bootstrap-"));
  roots.push(root);
  const remote = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  const station = path.join(root, "station");
  run(root, ["git", "init", "--bare", "--initial-branch=main", remote]);
  run(root, ["git", "init", "--initial-branch=main", seed]);
  run(seed, ["git", "config", "user.name", "Factory Test"]);
  run(seed, ["git", "config", "user.email", "factory@example.com"]);
  run(seed, ["git", "remote", "add", "origin", remote]);
  commit(seed, "snapshot without helper");
  run(seed, ["git", "push", "-u", "origin", "main"]);
  run(root, ["git", "clone", remote, station]);
  run(station, ["git", "config", "user.name", "Factory Test"]);
  run(station, ["git", "config", "user.email", "factory@example.com"]);
  return { remote, seed, station };
};

/** @param {string} seed */
const addHelper = (seed) => {
  const source = path.resolve(import.meta.dir, "../../../../../scripts/factory-session-sync.sh");
  const target = path.join(seed, "scripts", "factory-session-sync.sh");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(source));
  return commit(seed, "add session helper");
};

test("[integration] session command boots a snapshot that predates its sync helper", () => {
  const { remote, seed, station } = fixture();
  const remoteHead = addHelper(seed);
  run(seed, ["git", "push", "origin", "main"]);

  run(station, ["bash", "-lc", sessionSyncCommand({ repoDir: station, remoteUrl: remote })]);

  expect(run(station, ["git", "rev-parse", "HEAD"])).toBe(remoteHead);
  expect(readFileSync(path.join(station, "scripts", "factory-session-sync.sh"), "utf8")).toContain(
    "factory-session-sync",
  );
});

test("[integration] stale snapshot recovery preserves dirty feature work", () => {
  const { remote, seed, station } = fixture();
  const remoteHead = addHelper(seed);
  run(seed, ["git", "push", "origin", "main"]);
  run(station, ["git", "switch", "-c", "factory/in-progress"]);
  writeFileSync(path.join(station, "tracked.txt"), "unsaved\n");

  run(station, ["bash", "-lc", sessionSyncCommand({ repoDir: station, remoteUrl: remote })]);

  expect(run(station, ["git", "branch", "--show-current"])).toBe("factory/in-progress");
  expect(readFileSync(path.join(station, "tracked.txt"), "utf8")).toBe("unsaved\n");
  expect(run(station, ["git", "rev-parse", "origin/main"])).toBe(remoteHead);
});
