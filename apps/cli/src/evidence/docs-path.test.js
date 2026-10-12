import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { isDocsOnlyChange, isDocsPath } from "./docs-path.js";

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

/** @param {string} text */
const classifyStdin = async (text) => {
  const proc = Bun.spawn(["bun", "apps/cli/src/evidence/docs-path.js"], {
    cwd: ROOT,
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

describe("docs-path stdin", () => {
  test("prints true only when every path is docs", async () => {
    const docs = await classifyStdin("docs/engine-qa.md\nCONTEXT.md\nfeatures/feature-map.json\n");
    expect(docs).toEqual({ stdout: "true", code: 0 });
    const mixed = await classifyStdin("AGENTS.md\napps/engine/src/tick.js\n");
    expect(mixed).toEqual({ stdout: "false", code: 0 });
    const empty = await classifyStdin("\n");
    expect(empty).toEqual({ stdout: "false", code: 0 });
  });
});
