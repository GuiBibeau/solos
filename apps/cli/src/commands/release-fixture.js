// @ts-check
/**
 * A throwaway git checkout for the release commands' tests: one commit, optionally a
 * `solos@<version>` tag on it, and a `solos@9.0.0` on an unmerged branch beside it that must
 * never count as history. No global git config is read, so a signing hook cannot interfere.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const AUTHOR = ["-c", "user.name=solos", "-c", "user.email=solos@example.com"];

/** @param {string} dir @param {string[]} args */
export const gitIn = (dir, args) =>
  execFileSync("git", [...AUTHOR, ...args], { cwd: dir, env: GIT_ENV, encoding: "utf8" });

/**
 * @param {string} prefix @param {string | null} version
 * @param {{ manifest?: string; tracked?: Record<string, string> }} [content] files committed on
 *   the base commit; `manifest` is server.json
 */
export const releasedRepo = (prefix, version, content = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  gitIn(dir, ["init", "-q", "-b", "main"]);
  const files = {
    ...content.tracked,
    ...(content.manifest && { "server.json": content.manifest }),
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  gitIn(dir, ["add", "-A"]);
  gitIn(dir, ["commit", "-q", "--allow-empty", "-m", "base"]);
  if (version !== null) {
    gitIn(dir, ["tag", `solos@${version}`]);
    gitIn(dir, ["checkout", "-q", "-b", "elsewhere"]);
    gitIn(dir, ["commit", "-q", "--allow-empty", "-m", "future"]);
    gitIn(dir, ["tag", "solos@9.0.0"]);
    gitIn(dir, ["checkout", "-q", "main"]);
  }
  return dir;
};
