// @ts-check
import { expect, test } from "bun:test";
import { verificationResult } from "./station-verification.js";

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
