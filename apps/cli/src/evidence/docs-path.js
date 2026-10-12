// @ts-check
/**
 * Which paths are documentation for the CI changes gate and the evidence ancestor rule.
 * Anything else — code, config, workflows — is not, including apps/engine, the cap ledger,
 * tick/strategy, and swap/transfer builders even if a markdown file lands in those trees.
 */
import { readFileSync } from "node:fs";

/**
 * Roots that always run full verify. Matched as the directory itself or a file inside it.
 * @type {readonly string[]}
 */
const CODE_ROOTS = [
  "apps/engine",
  "packages/core/src/strategy",
  "packages/core/src/swap",
  "packages/core/src/transfer",
  "packages/solana/src/strategy",
  "packages/solana/src/swap",
  "packages/solana/src/transfer",
  "packages/solana/src/executor",
  ".github/workflows",
  ".github/actions",
];

/**
 * @param {string} file
 * @returns {string | undefined}
 */
const normalize = (file) => {
  const path = file.replaceAll("\\", "/").replace(/^\.\//, "");
  if (path === "" || path.startsWith("/") || path.split("/").includes("..")) return undefined;
  return path;
};

/**
 * Strategy schemas live beside other action files as `strategy-*`, not in their own directory.
 * @param {string} path
 */
const isActionsStrategyFile = (path) =>
  path.startsWith("packages/actions/src/strategy-") ||
  path.startsWith("packages/actions/src/strategy.");

/**
 * @param {string} path
 */
const isCodeRoot = (path) =>
  isActionsStrategyFile(path) ||
  CODE_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));

/**
 * A docs path is `docs/**`, any `*.md` (CONTEXT.md, AGENTS.md, ADRs, engine-qa.md), or
 * `features/feature-map.json`. Code roots above win over the markdown allowlist.
 * @param {string} file
 */
export const isDocsPath = (file) => {
  const path = normalize(file);
  if (path === undefined || isCodeRoot(path)) return false;
  return (
    path.startsWith("docs/") ||
    path.endsWith(".md") ||
    path === "features/feature-map.json" ||
    path === "engine-qa.md"
  );
};

/**
 * Pull-request classification. An empty file list is not docs-only (fail closed to full verify).
 * @param {readonly string[]} paths
 */
export const isDocsOnlyChange = (paths) =>
  paths.length > 0 && paths.every((path) => isDocsPath(path));

if (import.meta.main) {
  const paths = readFileSync(0, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  process.stdout.write(isDocsOnlyChange(paths) ? "true\n" : "false\n");
}
