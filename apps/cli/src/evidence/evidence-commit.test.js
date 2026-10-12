import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkEvidence,
  diffIsDocsOnlyAncestor,
  pathsFromNameStatus,
  reviewEvidence,
} from "./evidence-commit.js";
import { captureCommand } from "./run-steps.js";
import { REQUIRED_STEPS } from "./schema.js";

/** @param {string} sha */
const bodyFor = (sha) => {
  const evidence = {
    ok: true,
    sha,
    dirty: false,
    scope: "check",
    versions: { bun: "1.3.14", surfpool: null },
    steps: REQUIRED_STEPS.check.map((name) => ({
      name,
      command: name,
      ok: true,
      ms: 1,
      summary: "ok",
    })),
    startedAt: "2026-10-12T00:00:00.000Z",
    durationMs: 10,
  };
  return `## Evidence\n\n\`\`\`json\n${JSON.stringify(evidence)}\n\`\`\`\n`;
};

describe("evidence sha resolution", () => {
  test("name-status keeps both sides of a rename", () => {
    const text = "M\tdocs/a.md\nR100\tapps/cli/old.js\tdocs/old.md\nD\tapp.js\n";
    expect(pathsFromNameStatus(text)).toEqual([
      "docs/a.md",
      "apps/cli/old.js",
      "docs/old.md",
      "app.js",
    ]);
  });

  test("a sha mismatch consults the relation; other failures do not", async () => {
    const head = "b".repeat(40);
    const evidenceSha = "834f0b2caf1def4fffdeab4235ee0417d95c6955";
    /** @type {string[]} */
    const asked = [];
    const accepted = await checkEvidence(bodyFor(evidenceSha), head, async (sha) => {
      asked.push(sha);
      return { ok: true };
    });
    expect(accepted.ok).toBe(true);
    expect(asked).toEqual([evidenceSha]);

    const unrelated = await checkEvidence(bodyFor(evidenceSha), head, async () => ({
      ok: false,
      reason: "sha mismatch: unrelated",
    }));
    expect(unrelated.ok).toBe(false);
    if (!unrelated.ok) expect(unrelated.reason).toContain("unrelated");

    let didConsult = false;
    const missing = await checkEvidence("# Title\n\nno evidence\n", head, async () => {
      didConsult = true;
      return { ok: true };
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toContain("missing");
    expect(didConsult).toBe(false);
  });

  test("HEAD resolves, a docs-only ancestor passes, and other commits fail", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "solos-evidence-"));
    try {
      await git(cwd, ["init", "-b", "main"]);
      const code = await commit({ cwd, file: "app.js", content: "code\n", message: "code" });
      const docs = await commit({
        cwd,
        file: "docs/engine-qa.md",
        content: "notes\n",
        message: "docs",
      });
      expect((await diffIsDocsOnlyAncestor(code, docs, cwd)).ok).toBe(true);
      expect((await reviewEvidence(bodyFor(code), "HEAD", cwd)).ok).toBe(true);
      expect((await reviewEvidence(bodyFor("HEAD"), "HEAD", cwd)).ok).toBe(true);

      const changed = await commit({
        cwd,
        file: "app.js",
        content: "code changed\n",
        message: "code again",
      });
      const codeVerdict = await diffIsDocsOnlyAncestor(code, changed, cwd);
      expect(codeVerdict.ok).toBe(false);
      if (!codeVerdict.ok) expect(codeVerdict.reason).toContain("app.js");
      const stale = await reviewEvidence(bodyFor(code), "HEAD", cwd);
      expect(stale.ok).toBe(false);
      if (!stale.ok) expect(stale.reason).toContain("sha mismatch");
      expect((await reviewEvidence(bodyFor("HEAD"), "HEAD", cwd)).ok).toBe(true);
      const missing = await reviewEvidence("# nothing\n", "HEAD", cwd);
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.reason).toContain("missing");

      const foreign = await diffIsDocsOnlyAncestor("c".repeat(40), changed, cwd);
      expect(foreign.ok).toBe(false);
      if (!foreign.ok) expect(foreign.reason).toContain("sha mismatch");
      expect((await diffIsDocsOnlyAncestor(changed, docs, cwd)).ok).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

/**
 * @param {string} cwd
 * @param {string[]} args
 */
const git = async (cwd, args) => {
  const result = await captureCommand(
    [
      "git",
      "-c",
      "user.email=evidence@example.com",
      "-c",
      "user.name=Evidence",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    cwd,
  );
  if (result.code !== 0) throw new Error(result.output);
  return result.stdout.trim();
};

/**
 * @param {{ cwd: string, file: string, content: string, message: string }} spec
 */
const commit = async (spec) => {
  await mkdir(path.join(spec.cwd, spec.file, ".."), { recursive: true });
  await writeFile(path.join(spec.cwd, spec.file), spec.content);
  await git(spec.cwd, ["add", "--", spec.file]);
  await git(spec.cwd, ["commit", "-m", spec.message]);
  return git(spec.cwd, ["rev-parse", "HEAD"]);
};
