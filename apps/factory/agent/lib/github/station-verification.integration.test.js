// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { measure } from "./station-measurements.js";
import { verifyStation } from "./station-verification.js";

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

/** @returns {Record<string, string|undefined>} */
const cleanEnvironment = () => {
  const environment = { ...process.env };
  for (const name of Object.keys(environment))
    if (/^(?:SOLOS_|SOLANA_|AI_GATEWAY_API_KEY$)/u.test(name)) delete environment[name];
  return environment;
};

const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), "factory-station-"));
  roots.push(root);
  const station = path.join(root, "repo");
  run(root, ["git", "clone", "--shared", path.resolve(import.meta.dir, "../../../../.."), station]);
  const head = run(station, ["git", "rev-parse", "HEAD"]);
  /** @type {import("eve/sandbox").SandboxSession} */
  const sandbox = /** @type {import("eve/sandbox").SandboxSession} */ (
    /** @type {unknown} */ ({
      run: async ({ command }) => {
        const local = command.replaceAll("/workspace/repo", station);
        const result = Bun.spawnSync(["bash", "-lc", local], {
          env: cleanEnvironment(),
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
  return { head, sandbox, station };
};

describe("[integration] station verification lifecycle", () => {
  test("runs the real solos verifier and preserves its complete Evidence", async () => {
    const { head, sandbox } = fixture();
    /** @type {import("eve/tools").ToolContext} */
    const context = /** @type {import("eve/tools").ToolContext} */ (
      /** @type {unknown} */ ({ getSandbox: async () => sandbox })
    );
    const result = await verifyStation({ expectedHead: head, scope: "unit" }, context);
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.evidence)).toMatchObject({ dirty: false, ok: true, sha: head });
  }, 120_000);

  test("starts and stops the real pinned Surfpool offline", async () => {
    const { head, sandbox, station } = fixture();
    const facts = await measure(sandbox, { expectedHead: head, scope: "full" }, null);
    expect(facts.requiredSurfpoolVersion).toBe("1.5.0");
    expect(facts.surfpoolVersion).toContain("1.5.0");
    expect(facts.offlineStartup).toBe(true);
    expect(run(station, ["bun", "run", "solos", "dev", "surfpool", "status"])).toContain(
      '"running":false',
    );
  }, 120_000);
});
