// @ts-check
import { describe, expect, test } from "bun:test";
import { promotePlan, releasePackages, rollbackPlan } from "./plans.js";
import {
  assertForward,
  assertManifestVersion,
  assertNotDeprecated,
  assertPublished,
  assertRollbackSource,
  currentLatest,
  displayCommand,
  npmJsonValue,
  runPlan,
} from "./run-plan.js";

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

/** An npm that reports no deprecation message for anything. */
const clean = async () => ({ code: 0, output: "\n" });

/** An npm where one platform package of 0.1.1 carries a deprecation message. */
const deprecated = async (/** @type {string[]} */ argv) => ({
  code: 0,
  output: argv.includes("@solos-sh/cli-linux-x64@0.1.1") ? '"rolled back; bad build"\n' : "\n",
});

/** An npm whose stderr carries a warning while stdout says nothing is deprecated. */
const noisy = async () => ({
  code: 0,
  output: '\nnpm warn Unknown env config "http-proxy"\n',
  stdout: "\n",
});

/** An npm that cannot be reached. */
const unreachable = async () => ({ code: 1, output: "ETIMEDOUT" });
const npm12Clean = async () => ({ code: 0, output: "[]\n" });
const npm12Deprecated = async () => ({ code: 0, output: '["rolled back"]\n' });
const npm12Latest = async () => ({ code: 0, output: '["0.1.0"]\n' });
const npm12Present = async () => ({ code: 0, output: '["0.1.1"]\n' });

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

  test("promote validates the manifest, moves latest everywhere, flips the release, then publishes", () => {
    const plan = promotePlan({ version: "0.1.1", registryDir: "/tmp/r" });
    expect(plan.map((s) => s.argv.join(" "))).toEqual([
      "mcp-publisher validate",
      "npm dist-tag add @solos-sh/cli@0.1.1 latest",
      "npm dist-tag add @solos-sh/cli-darwin-arm64@0.1.1 latest",
      "npm dist-tag add @solos-sh/cli-darwin-x64@0.1.1 latest",
      "npm dist-tag add @solos-sh/cli-linux-x64@0.1.1 latest",
      "npm dist-tag add @solos-sh/cli-linux-arm64@0.1.1 latest",
      "gh release edit solos@0.1.1 --latest --prerelease=false",
      "mcp-publisher publish",
    ]);
    expect(plan[0]).toMatchObject({ cwd: "/tmp/r" });
    expect(plan.at(-1)).toMatchObject({
      name: "MCP Registry publish from solos@0.1.1",
      cwd: "/tmp/r",
    });
    const bare = promotePlan({ version: "0.1.1" });
    expect(bare[0]?.argv[0]).toBe("npm");
    expect(bare.at(-1)?.argv[0]).toBe("gh");
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
    expect(assertForward("0.1.0", "0.1.0")).toBeUndefined();
    expect(() => assertForward("0.0.9", "0.1.0")).toThrow();
    let refusal;
    try {
      assertForward("0.0.9", "0.1.0");
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      _tag: "ReleaseRefused",
      reason: "0.0.9 is older than latest, 0.1.0; promote only moves forward",
    });
  });

  test("a rollback source must be what latest points at, or latest is already the target", () => {
    expect(assertRollbackSource({ from: "0.1.2", to: "0.1.1", latest: "0.1.2" })).toBeUndefined();
    expect(assertRollbackSource({ from: "0.1.2", to: "0.1.1", latest: "0.1.1" })).toBeUndefined();
    let refusal;
    try {
      assertRollbackSource({ from: "0.1.1", to: "0.1.0", latest: "0.1.2" });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      _tag: "ReleaseRefused",
      reason: "latest points at 0.1.2, which is neither --from 0.1.1 nor --to 0.1.0",
      remedy: "pass --from 0.1.2 to roll back what latest points at",
    });
  });

  test("a displayed command quotes what a shell would need quoted", async () => {
    expect(displayCommand(["npm", "deprecate", "@solos-sh/cli@0.1.1", "bad build; see #9"])).toBe(
      "npm deprecate @solos-sh/cli@0.1.1 'bad build; see #9'",
    );
    expect(displayCommand(["gh", "release", "edit", "solos@0.1.1", "--latest"])).toBe(
      "gh release edit solos@0.1.1 --latest",
    );
    const printed = await runPlan(
      rollbackPlan({ to: "0.1.0", from: "0.1.1", reason: "it's bad" }),
      {
        dryRun: true,
      },
    );
    expect(printed.steps.at(-1)?.command).toBe(
      String.raw`npm deprecate @solos-sh/cli-linux-arm64@0.1.1 'it'\''s bad'`,
    );
  });

  test("a deprecated version is never pointed at again", async () => {
    expect(await assertNotDeprecated("0.1.1", clean)).toBeUndefined();
    await expect(assertNotDeprecated("0.1.1", deprecated)).rejects.toMatchObject({
      _tag: "ReleaseRefused",
      reason: "@solos-sh/cli-linux-x64@0.1.1 is deprecated on npm: rolled back; bad build",
    });
    expect(await assertNotDeprecated("0.1.1", noisy)).toBeUndefined();
    await expect(assertNotDeprecated("0.1.1", unreachable)).rejects.toMatchObject({
      _tag: "ReleaseRefused",
      reason:
        "could not read the deprecation status of @solos-sh/cli@0.1.1 from npm (exit 1); nothing was changed",
    });
  });

  test("the tagged manifest must name the promoted version twice", () => {
    const good = JSON.stringify({ version: "0.1.1", packages: [{ version: "0.1.1" }] });
    expect(assertManifestVersion(good, "0.1.1")).toBeUndefined();
    const stale = JSON.stringify({ version: "0.1.0", packages: [{ version: "0.1.1" }] });
    expect(() => assertManifestVersion(stale, "0.1.1")).toThrow();
    expect(() => assertManifestVersion("{not json", "0.1.1")).toThrow();
  });

  test("npm --json answers are read as values on npm 11 and npm 12 alike", async () => {
    expect(npmJsonValue('"0.1.1"\n')).toBe("0.1.1");
    expect(npmJsonValue('["0.1.1"]')).toBe("0.1.1");
    expect(npmJsonValue("[]")).toBeUndefined();
    expect(npmJsonValue("")).toBeUndefined();
    expect(npmJsonValue("not json")).toBeUndefined();
    expect(await assertNotDeprecated("0.1.1", npm12Clean)).toBeUndefined();
    await expect(assertNotDeprecated("0.1.1", npm12Deprecated)).rejects.toMatchObject({
      reason: "@solos-sh/cli@0.1.1 is deprecated on npm: rolled back",
    });
    expect(await currentLatest(npm12Latest)).toBe("0.1.0");
    expect(await assertPublished("0.1.1", npm12Present)).toBeUndefined();
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
