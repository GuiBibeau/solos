import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  FILES_API_CAP,
  isCompleteDocsOnly,
  isDocsOnlyChange,
  isDocsPath,
  listingFromTsv,
} from "./docs-path.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

describe("docs paths", () => {
  test("docs, markdown, the feature map, and engine-qa are docs", () => {
    const docs = [
      "docs/engine-qa.md",
      "docs/adr/0016-verification-evidence.md",
      "docs/img/logo.png",
      "CONTEXT.md",
      "AGENTS.md",
      "CONTRIBUTING.md",
      "README.md",
      "features/README.md",
      "features/feature-map.json",
      "engine-qa.md",
      "apps/landing/README.md",
      "packages/actions/README.md",
      ".github/pull_request_template.md",
    ];
    expect(docs.every((path) => isDocsPath(path))).toBe(true);
    expect(isDocsOnlyChange(docs)).toBe(true);
  });

  test("code, config, workflows, and empty diffs are not docs-only", () => {
    const code = [
      "apps/engine/src/cap-ledger.js",
      "apps/engine/src/tick-clock-loop.js",
      "apps/engine/README.md",
      "packages/core/src/strategy/domain/tick.js",
      "packages/core/src/strategy/README.md",
      "packages/core/src/swap/NOTES.md",
      "packages/core/src/transfer/NOTES.md",
      "packages/actions/src/strategy-tick-source.js",
      "packages/actions/src/strategy-notes.md",
      "packages/solana/src/strategy/http-cap-ledger.js",
      "packages/solana/src/swap/NOTES.md",
      "packages/solana/src/transfer/NOTES.md",
      "packages/solana/src/executor/swap-sol.js",
      "packages/solana/src/executor/transfer-sol.js",
      "packages/solana/src/executor/NOTES.md",
      "apps/cli/src/main.js",
      "package.json",
      "bun.lock",
      "eslint.config.js",
      ".github/workflows/ci.yml",
      ".github/workflows/README.md",
      ".github/actions/setup/README.md",
      "features/other.json",
      "docs/../package.json",
      "/etc/passwd",
      "",
    ];
    for (const path of code) expect(isDocsPath(path)).toBe(false);
    expect(isDocsOnlyChange([])).toBe(false);
    expect(isDocsOnlyChange(["CONTEXT.md", "apps/cli/src/main.js"])).toBe(false);
  });
});

/**
 * @param {string} text
 * @param {string | undefined} changedFiles
 */
const classifyStdin = async (text, changedFiles) => {
  const env = { ...process.env };
  delete env.CHANGED_FILES;
  if (changedFiles !== undefined) env.CHANGED_FILES = changedFiles;
  const proc = Bun.spawn(["bun", "apps/cli/src/evidence/docs-path.js"], {
    cwd: ROOT,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(text);
  await proc.stdin.end();
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { stdout: stdout.trim(), code };
};

describe("complete file list", () => {
  test("a rename is one listed file and both names must be docs", () => {
    const listing = listingFromTsv("docs/new.md\tdocs/old.md\n");
    expect(listing).toEqual({ listed: 1, paths: ["docs/new.md", "docs/old.md"] });
    if (listing === undefined) throw new Error("expected a listing");
    expect(isCompleteDocsOnly({ ...listing, changedFiles: 1 })).toBe(true);
    const renamedCode = listingFromTsv("docs/notes.md\tapps/engine/src/tick.js\n");
    if (renamedCode === undefined) throw new Error("expected a listing");
    expect(isCompleteDocsOnly({ ...renamedCode, changedFiles: 1 })).toBe(false);
  });

  test("the API cap, a count mismatch, and a quoted row fail closed", () => {
    const one = { paths: ["CONTEXT.md"], listed: 1, changedFiles: 1 };
    expect(isCompleteDocsOnly(one)).toBe(true);
    expect(isCompleteDocsOnly({ ...one, changedFiles: 2 })).toBe(false);
    expect(
      isCompleteDocsOnly({
        paths: ["CONTEXT.md"],
        listed: FILES_API_CAP,
        changedFiles: FILES_API_CAP,
      }),
    ).toBe(false);
    const underCap = FILES_API_CAP - 1;
    expect(
      isCompleteDocsOnly({ paths: ["CONTEXT.md"], listed: underCap, changedFiles: underCap }),
    ).toBe(true);
    expect(listingFromTsv('CONTEXT.md\t"quoted"\n')).toBeUndefined();
    expect(listingFromTsv("\tapps/cli/src/main.js\n")).toBeUndefined();
  });
});

describe("docs-path stdin", () => {
  test("prints true only when the list is complete and every path is docs", async () => {
    const docs = await classifyStdin(
      "docs/engine-qa.md\t\nCONTEXT.md\t\nfeatures/feature-map.json\t\n",
      "3",
    );
    expect(docs).toEqual({ stdout: "true", code: 0 });
    const mixed = await classifyStdin("AGENTS.md\t\napps/engine/src/tick.js\t\n", "2");
    expect(mixed).toEqual({ stdout: "false", code: 0 });
    const empty = await classifyStdin("\n", "0");
    expect(empty).toEqual({ stdout: "false", code: 0 });
    const missingCount = await classifyStdin("CONTEXT.md\t\n", undefined);
    expect(missingCount).toEqual({ stdout: "false", code: 0 });
    const mismatch = await classifyStdin("CONTEXT.md\t\n", "2");
    expect(mismatch).toEqual({ stdout: "false", code: 0 });
    const rename = await classifyStdin("docs/new.md\tdocs/old.md\n", "1");
    expect(rename).toEqual({ stdout: "true", code: 0 });
    const quoted = await classifyStdin('CONTEXT.md\t"old"\n', "1");
    expect(quoted).toEqual({ stdout: "false", code: 0 });
  });
});
