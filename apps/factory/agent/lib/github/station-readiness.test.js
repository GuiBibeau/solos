// @ts-check
import { describe, expect, test } from "bun:test";
import { checkoutDecision } from "./branch-checkout.js";
import { evaluateReadiness } from "./station-readiness.js";

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
  expectedRemoteHead: SHA,
  lockfileInstalled: true,
  lockfileSkipped: false,
  offlineStartup: true,
  platform: "Linux",
  remoteHead: SHA,
  remoteLookupFailed: false,
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

  for (const reported of ["surfpool 1.5.0-dev", "surfpool 1.5.0 extra"])
    test(`rejects non-exact Surfpool output: ${reported}`, () => {
      expect(
        evaluateReadiness(facts({ surfpoolVersion: reported })).diagnostics.map(
          (item) => item.code,
        ),
      ).toContain("surfpool-version-mismatch");
    });

  test("fails dirty, wrong and remotely moved revisions", () => {
    const result = evaluateReadiness(
      facts({ actualHead: "b".repeat(40), dirty: true, remoteHead: "c".repeat(40) }),
    );
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["dirty-checkout", "wrong-head", "remote-moved"]),
    );
  });

  test("allows a committed amendment while guarding its remote baseline", () => {
    const local = "b".repeat(40);
    expect(
      evaluateReadiness(
        facts({ actualHead: local, expectedHead: local, expectedRemoteHead: SHA, remoteHead: SHA }),
      ).ready,
    ).toBe(true);
  });

  test("explains that dependency install was skipped to preserve dirty work", () => {
    const result = evaluateReadiness(
      facts({ dirty: true, lockfileInstalled: false, lockfileSkipped: true }),
    );
    expect(result.diagnostics.map((item) => item.code)).not.toContain("lockfile-install-failed");
    expect(result.diagnostics[0]?.message).toContain("preserve");
    expect(result.diagnostics[0]?.message).toContain("retry");
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
      targetHead: "b".repeat(40),
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

  test("preserves an existing diverged target when a different branch is current", () => {
    const result = checkoutDecision({
      branch: "factory/test",
      currentBranch: "main",
      currentHead: SHA,
      dirty: false,
      remoteHead: SHA,
      targetHead: "b".repeat(40),
    });
    expect(result.error).toContain("local commits were preserved");
  });
});
