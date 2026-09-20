// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkoutBranch } from "./branch-checkout.js";

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

/** @param {string} cwd @param {string} content */
const commit = (cwd, content) => {
  writeFileSync(path.join(cwd, "tracked.txt"), content);
  run(cwd, ["git", "add", "tracked.txt"]);
  run(cwd, ["git", "commit", "-m", content]);
  return run(cwd, ["git", "rev-parse", "HEAD"]);
};

const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), "branch-checkout-"));
  roots.push(root);
  const remote = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  const station = path.join(root, "station");
  run(root, ["git", "init", "--bare", "--initial-branch=main", remote]);
  run(root, ["git", "init", "--initial-branch=main", seed]);
  for (const cwd of [seed]) {
    run(cwd, ["git", "config", "user.name", "Factory Test"]);
    run(cwd, ["git", "config", "user.email", "factory@example.com"]);
  }
  commit(seed, "initial");
  run(seed, ["git", "remote", "add", "origin", remote]);
  run(seed, ["git", "push", "-u", "origin", "main"]);
  run(seed, ["git", "switch", "-c", "factory/test"]);
  const remoteHead = commit(seed, "remote");
  run(seed, ["git", "push", "-u", "origin", "factory/test"]);
  run(root, ["git", "clone", remote, station]);
  run(station, ["git", "config", "user.name", "Factory Test"]);
  run(station, ["git", "config", "user.email", "factory@example.com"]);
  run(station, ["git", "switch", "-c", "factory/test", "main"]);
  const localHead = commit(station, "local-unpublished");
  run(station, ["git", "switch", "main"]);
  return { localHead, remote, remoteHead, station };
};

describe("[integration] revision branch checkout", () => {
  test("preserves an unpublished target branch while another branch is current", async () => {
    const { localHead, remote, remoteHead, station } = fixture();
    /** @type {import("eve/sandbox").SandboxSession} */
    const sandbox = /** @type {import("eve/sandbox").SandboxSession} */ (
      /** @type {unknown} */ ({
        run: async ({ command }) => {
          const local = command.replaceAll("/workspace/repo", station);
          const result = Bun.spawnSync(["bash", "-lc", local], {
            stderr: "pipe",
            stdout: "pipe",
          });
          return {
            exitCode: result.exitCode,
            stderr: result.stderr.toString(),
            stdout: result.stdout.toString(),
          };
        },
      })
    );
    /** @type {import("eve/tools").ToolContext} */
    const context = /** @type {import("eve/tools").ToolContext} */ (
      /** @type {unknown} */ ({ getSandbox: async () => sandbox })
    );
    const result = await checkoutBranch(
      { branch: "factory/test", expectedHead: remoteHead },
      context,
      async (ctx, branch) => {
        const active = await ctx.getSandbox();
        const fetched = await active.run({
          command: `git -C /workspace/repo fetch '${remote}' '${branch}'`,
        });
        return {
          detail: String(fetched.stderr || fetched.stdout).trim(),
          exitCode: fetched.exitCode,
        };
      },
    );
    expect(result.success).toBe(false);
    expect("error" in result ? result.error : "").toContain("local commits were preserved");
    expect(run(station, ["git", "branch", "--show-current"])).toBe("main");
    expect(run(station, ["git", "rev-parse", "factory/test"])).toBe(localHead);
    expect(readFileSync(path.join(station, "tracked.txt"), "utf8")).toBe("initial");
  });
});
