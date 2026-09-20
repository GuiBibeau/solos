// @ts-check
import { expect, test } from "bun:test";
import { verificationResult, verifyStation } from "./station-verification.js";

const SHA = "a".repeat(40);

test("verification preserves exact JSON and cannot hide the process exit code", () => {
  const names = [
    "line-limit",
    "format",
    "lint",
    "depcruise",
    "typecheck",
    "test:unit",
    "test:integration",
  ];
  const evidence = `${JSON.stringify({
    dirty: false,
    durationMs: 10,
    ok: true,
    scope: "full",
    sha: SHA,
    startedAt: "2026-09-20T00:00:00.000Z",
    steps: names.map((name) => ({ command: `run ${name}`, ms: 1, name, ok: true, summary: "ok" })),
    versions: { bun: "1.3.14", surfpool: "1.5.0" },
  })}\n`;
  const result = verificationResult({
    facts: { actualHead: SHA },
    readiness: { diagnostics: [], ready: true },
    result: { code: 7, stderr: "integration failed", stdout: evidence },
    scope: "full",
  });
  expect(result.evidence).toBe(evidence);
  expect(result.exitCode).toBe(7);
  expect(result.evidenceMatches).toBe(true);
  expect(result.success).toBe(false);
});

test("verification rejects abbreviated or incomplete Evidence", () => {
  const result = verificationResult({
    facts: { actualHead: SHA },
    readiness: { diagnostics: [], ready: true },
    result: {
      code: 0,
      stderr: "",
      stdout: JSON.stringify({ dirty: false, ok: true, scope: "check", sha: SHA.slice(0, 7) }),
    },
    scope: "check",
  });
  expect(result.evidenceMatches).toBe(false);
  expect(result.success).toBe(false);
});

test("verification remains blocked when the first remote inspection fails", async () => {
  /** @type {string[]} */
  const commands = [];
  const outputs = new Map([
    ["git rev-parse HEAD", SHA],
    ["git branch --show-current", "factory/test"],
    ["git status --porcelain", ""],
    ["uname -s", "Linux"],
    ["uname -m", "x86_64"],
    ["command -v bun", "/workspace/.bun/bin/bun"],
    ["bun --version", "1.3.14"],
    ["tr -d '[:space:]' < .bun-version", "1.3.14"],
    ["command -v surfpool", "/workspace/.local/bin/surfpool"],
    ["surfpool --version", "surfpool 1.5.0"],
  ]);
  /** @type {import("eve/sandbox").SandboxSession} */
  const sandbox = /** @type {import("eve/sandbox").SandboxSession} */ (
    /** @type {unknown} */ ({
      run: async ({ command }) => {
        commands.push(command);
        const entry = [...outputs].find(([needle]) => command.includes(needle));
        const stdout = entry?.[1] ?? (command.includes("SURFPOOL_VERSION") ? "1.5.0" : "");
        return { exitCode: 0, stderr: "", stdout };
      },
    })
  );
  /** @type {import("eve/tools").ToolContext} */
  const context = /** @type {import("eve/tools").ToolContext} */ (
    /** @type {unknown} */ ({ getSandbox: async () => sandbox })
  );
  const observations = [undefined, SHA];
  const result = await verifyStation(
    { branch: "factory/test", expectedHead: SHA, expectedRemoteHead: SHA, scope: "unit" },
    context,
    async () => observations.shift(),
  );
  expect(result.success).toBe(false);
  expect(result.readiness.diagnostics.map((item) => item.code)).toContain(
    "remote-inspection-failed",
  );
  expect(commands.some((command) => command.includes("bun install"))).toBe(false);
  expect(commands.some((command) => command.includes("dev verify"))).toBe(false);
});
