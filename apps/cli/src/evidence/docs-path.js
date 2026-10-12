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

/** The list-pull-request-files endpoint returns at most this many files. */
export const FILES_API_CAP = 3000;

/**
 * @param {string | undefined} value
 * @returns {number | undefined}
 */
const parseCount = (value) => {
  if (value === undefined || !/^[0-9]+$/u.test(value)) return undefined;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : undefined;
};

/**
 * One TSV row per file the API returned: filename, then the previous name when the file was renamed.
 * A quoted field is refused so a truncated or escaped row cannot be classified as complete.
 * @param {string} text
 * @returns {{ listed: number, paths: string[] } | undefined}
 */
export const listingFromTsv = (text) => {
  const rows = text.split("\n").filter((line) => line !== "");
  if (rows.some((line) => line.includes('"'))) return undefined;
  /** @type {string[]} */
  const paths = [];
  for (const row of rows) {
    const tab = row.indexOf("\t");
    const filename = tab === -1 ? row : row.slice(0, tab);
    if (filename === "") return undefined;
    const previous = tab === -1 ? "" : row.slice(tab + 1);
    paths.push(filename);
    if (previous !== "") paths.push(previous);
  }
  return { listed: rows.length, paths };
};

/**
 * Docs-only only when the API list is complete and every path is docs. `listed` counts file
 * entries, not a rename's extra previous name. At {@link FILES_API_CAP} the endpoint may have
 * truncated, so that length is never complete. A count that disagrees with `changedFiles` is not
 * complete either.
 * @param {{ paths: readonly string[], listed: number, changedFiles: number }} listing
 */
export const isCompleteDocsOnly = (listing) => {
  const { paths, listed, changedFiles } = listing;
  if (!Number.isSafeInteger(listed) || !Number.isSafeInteger(changedFiles)) return false;
  if (listed !== changedFiles || listed >= FILES_API_CAP) return false;
  return isDocsOnlyChange(paths);
};

if (import.meta.main) {
  const listing = listingFromTsv(readFileSync(0, "utf8"));
  const changedFiles = parseCount(process.env.CHANGED_FILES);
  const docsOnly =
    listing !== undefined &&
    changedFiles !== undefined &&
    isCompleteDocsOnly({ ...listing, changedFiles });
  process.stdout.write(docsOnly ? "true\n" : "false\n");
}
