// @ts-check
import { describe, expect, test } from "bun:test";
import { checkoutDecision } from "./branch-checkout.js";
import { evaluateReadiness } from "./station-readiness.js";
import { verificationResult } from "./station-verification.js";

const SHA = "a".repeat(40);
/** @param {Partial<Parameters<typeof evaluateReadiness>[0]>} [overrides] @returns {Parameters<typeof evaluateReadiness>[0]} */
const facts = (overrides = {}) => ({
  actualHead: SHA,
  architecture: "x86_64",
  branch: "factory/test",
  bunPath: "/workspace/.bun/bin/bun",
  bunVersion: "1.3.14",
  dirty: false,
  expectedBranch: "factory/test",
  expectedHead: SHA,
  lockfileInstalled: true,
  offlineStartup: true,
  platform: "Linux",
  remoteHead: SHA,
  requiredBunVersion: "1.3.14",
  requiredSurfpoolVersion: "1.5.0",
  scope: "full",
  surfpoolPath: "/workspace/.local/bin/surfpool",
  surfpoolVersion: "surfpool 1.5.0",
  ...overrides,
});

describe("station readiness", () => {
  test("accepts measured pinned full capability", () => {
    expect(evaluateReadiness(facts())).toEqual({ diagnostics: [], ready: true });
  });

  test("check scope does not require or start Surfpool", () => {
    expect(
      evaluateReadiness(
        facts({ offlineStartup: null, scope: "check", surfpoolPath: null, surfpoolVersion: null }),
      ).ready,
    ).toBe(true);
  });

  const failures =
    /** @type {Array<[string, Partial<Parameters<typeof evaluateReadiness>[0]>]>} */ ([
      ["bun-missing", { bunPath: null }],
      ["bun-version-mismatch", { bunVersion: "1.2.0" }],
      ["surfpool-missing", { surfpoolPath: null }],
      ["surfpool-version-mismatch", { surfpoolVersion: "surfpool 1.4.0" }],
      ["unsupported-architecture", { architecture: "aarch64" }],
      ["surfpool-offline-startup-failed", { offlineStartup: false }],
    ]);
  for (const [code, override] of failures)
    test(`reports ${code} distinctly`, () => {
      expect(evaluateReadiness(facts(override)).diagnostics.map((item) => item.code)).toContain(
        code,
      );
    });

  test("fails dirty, wrong and remotely moved revisions", () => {
    const result = evaluateReadiness(
      facts({ actualHead: "b".repeat(40), dirty: true, remoteHead: "c".repeat(40) }),
    );
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["dirty-checkout", "wrong-head", "remote-moved"]),
    );
  });
});

describe("revision checkout preservation", () => {
  test("does not touch a dirty checkout", () => {
    expect(checkoutDecision({ dirty: true }).error).toContain("byte-for-byte intact");
  });

  test("preserves unpushed commits and refuses moved remote heads", () => {
    const local = checkoutDecision({
      branch: "factory/test",
      currentBranch: "factory/test",
      currentHead: "b".repeat(40),
      dirty: false,
      expectedHead: SHA,
      remoteHead: SHA,
    });
    expect(local.error).toContain("local commits were preserved");
    const moved = checkoutDecision({
      branch: "factory/test",
      currentBranch: "main",
      currentHead: SHA,
      dirty: false,
      expectedHead: SHA,
      remoteHead: "c".repeat(40),
    });
    expect(moved.error).toContain("checkout was not changed");
  });
});

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
