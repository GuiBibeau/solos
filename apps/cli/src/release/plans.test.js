// @ts-check
import { describe, expect, test } from "bun:test";
import { promotePlan, releasePackages, rollbackPlan } from "./plans.js";
import { assertForward, assertPublished, currentLatest, runPlan } from "./run-plan.js";

/** @param {Record<string, { code: number; output: string }>} answers */
const fakeRunner = (answers) => {
  /** @type {string[]} */
  const seen = [];
  const runner = async (/** @type {string[]} */ argv) => {
    const key = argv.join(" ");
    seen.push(key);
    return answers[key] ?? { code: 0, output: "ok" };
  };
  return { runner, seen };
};

const DEPRECATE = (/** @type {string} */ from, /** @type {string} */ reason) =>
  releasePackages().map((pkg) => `npm deprecate ${pkg}@${from} ${reason}`);

describe("promotion and rollback plans", () => {
  test("five packages: the launcher and one per build target", () => {
    expect(releasePackages()).toEqual([
      "@solos-sh/cli",
      "@solos-sh/cli-darwin-arm64",
      "@solos-sh/cli-darwin-x64",
      "@solos-sh/cli-linux-x64",
      "@solos-sh/cli-linux-arm64",
    ]);
  });

  test("promote moves latest everywhere, flips the release, then publishes the registry from the tag's manifest", () => {
    const plan = promotePlan({ version: "0.1.1", registryDir: "/tmp/r" });
    expect(plan.map((s) => s.argv.join(" "))).toEqual([
      "npm dist-tag add @solos-sh/cli@0.1.1 latest",
      "npm dist-tag add @solos-sh/cli-darwin-arm64@0.1.1 latest",
      "npm dist-tag add @solos-sh/cli-darwin-x64@0.1.1 latest",
      "npm dist-tag add @solos-sh/cli-linux-x64@0.1.1 latest",
      "npm dist-tag add @solos-sh/cli-linux-arm64@0.1.1 latest",
      "gh release edit solos@0.1.1 --latest --prerelease=false",
      "mcp-publisher publish",
    ]);
    expect(plan.at(-1)).toMatchObject({
      name: "MCP Registry publish from solos@0.1.1",
      cwd: "/tmp/r",
    });
    expect(promotePlan({ version: "0.1.1" }).at(-1)?.argv[0]).toBe("gh");
  });

  test("rollback points back, then deprecates everywhere; the registry is never touched", () => {
    const plan = rollbackPlan({ to: "0.1.0", from: "0.1.1", reason: "bad build" });
    const argv = plan.map((s) => s.argv.join(" "));
    expect(argv[0]).toBe("npm dist-tag add @solos-sh/cli@0.1.0 latest");
    expect(argv[5]).toBe("gh release edit solos@0.1.0 --latest --prerelease=false");
    expect(argv.slice(6)).toEqual(DEPRECATE("0.1.1", "bad build"));
    expect(argv.some((command) => command.startsWith("mcp-publisher"))).toBe(false);
  });

  test("a dry run prints every step and runs nothing; a failure stops the plan", async () => {
    const plan = promotePlan({ version: "0.1.1" });
    const dry = fakeRunner({});
    const printed = await runPlan(plan, { runner: dry.runner, dryRun: true });
    expect(dry.seen).toEqual([]);
    expect(printed.ok).toBe(true);
    expect(printed.steps.every((s) => s.ok === null && s.summary === "dry run")).toBe(true);
    const failing = fakeRunner({
      "npm dist-tag add @solos-sh/cli-darwin-x64@0.1.1 latest": {
        code: 1,
        output: "E403 forbidden",
      },
    });
    const result = await runPlan(plan, { runner: failing.runner, dryRun: false });
    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[2]).toMatchObject({ ok: false, summary: "E403 forbidden" });
  });

  test("the runner receives a step's cwd", async () => {
    /** @type {Array<string | undefined>} */
    const cwds = [];
    const runner = async (/** @type {string[]} */ _argv, /** @type {string | undefined} */ cwd) => {
      cwds.push(cwd);
      return { code: 0, output: "ok" };
    };
    const steps = [
      { name: "a", argv: ["x"] },
      { name: "b", argv: ["y"], cwd: "/tmp/r" },
    ];
    await runPlan(steps, { runner, dryRun: false });
    expect(cwds).toEqual([undefined, "/tmp/r"]);
  });

  test("promotion only moves forward from the current latest", () => {
    expect(assertForward("0.1.1", "0.1.0")).toBeUndefined();
    expect(() => assertForward("0.1.0", "0.1.0")).toThrow();
    expect(() => assertForward("0.0.9", "0.1.0")).toThrow();
    let refusal;
    try {
      assertForward("0.0.9", "0.1.0");
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      _tag: "ReleaseRefused",
      reason: "0.0.9 is not newer than latest, 0.1.0; promote only moves forward",
    });
  });

  test("published checks refuse a version npm does not have, and read the current latest", async () => {
    const present = { code: 0, output: '"0.1.1"\n' };
    const missing = (/** @type {string[]} */ argv) =>
      Promise.resolve(
        argv.includes("@solos-sh/cli-linux-arm64@0.1.1") ? { code: 1, output: "E404" } : present,
      );
    await expect(assertPublished("0.1.1", missing)).rejects.toMatchObject({
      _tag: "ReleaseRefused",
      reason: "@solos-sh/cli-linux-arm64 not published at 0.1.1",
    });
    expect(await assertPublished("0.1.1", () => Promise.resolve(present))).toBeUndefined();
    expect(await currentLatest(() => Promise.resolve({ code: 0, output: '"0.1.0"\n' }))).toBe(
      "0.1.0",
    );
    await expect(
      currentLatest(() => Promise.resolve({ code: 1, output: "" })),
    ).rejects.toMatchObject({
      _tag: "ReleaseRefused",
    });
  });
});
