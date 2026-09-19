// @ts-check
import { readFile } from "node:fs/promises";
import nodePath from "node:path";

const MAX_LINES = 150;
const CODE_EXTENSIONS = new Set([".cjs", ".js", ".mjs"]);
const DEFAULT_REF = "refs/remotes/origin/main";
// These three pre-existing configuration files already have explicit max-lines exemptions in ESLint.
const APPROVED_EXCEPTIONS = new Set([
  ".dependency-cruiser.cjs",
  "eslint.config.js",
  "harness.config.js",
]);
/** @typedef {{ path: string; lines: number }} LineItem */

/** @param {string[]} args @returns {Promise<string>} */
const git = async (args) => {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(stderr.trim() || `git ${args.join(" ")} failed`);
  return stdout;
};

const resolveHead = () => git(["rev-parse", "HEAD"]).then((value) => value.trim());

/** @param {string} head */
const resolveBase = async (head) => {
  try {
    const defaultHead = (await git(["rev-parse", "--verify", DEFAULT_REF])).trim();
    if (head === defaultHead) return (await git(["rev-parse", `${head}^`])).trim();
    return (await git(["merge-base", head, defaultHead])).trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot resolve comparison base from ${DEFAULT_REF}: ${reason}`, {
      cause: error,
    });
  }
};

/** @param {string} base */
const changedFiles = async (base) => {
  const [changed, untracked] = await Promise.all([
    git(["diff", "--name-only", "-z", "--diff-filter=ACMR", base, "--"]),
    git(["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  return [...new Set(`${changed}${untracked}`.split("\0"))].filter((path) =>
    CODE_EXTENSIONS.has(nodePath.extname(path)),
  );
};

const trackedFiles = async () => {
  const output = await git(["ls-files", "-z"]);
  return output.split("\0").filter((path) => CODE_EXTENSIONS.has(nodePath.extname(path)));
};

/** @param {string} text */
const physicalLines = (text) => {
  if (text.length === 0) return 0;
  const breaks = text.match(/\n/g)?.length ?? 0;
  return breaks + (text.endsWith("\n") ? 0 : 1);
};

/** @param {string} path */
const lineCount = async (path) => physicalLines(await readFile(path, "utf8"));

/** @param {LineItem[]} violations @param {LineItem[]} approved @param {LineItem[]} debt */
const report = (violations, approved, debt) => {
  for (const item of violations)
    console.error(`${item.path}: ${item.lines} physical lines (maximum ${MAX_LINES})`);
  for (const item of approved)
    console.error(`approvedException=${item.path}:${item.lines} physical lines`);
  for (const item of debt) console.error(`debt: ${item.path}: ${item.lines} physical lines`);
};

const main = async () => {
  const head = await resolveHead();
  const base = await resolveBase(head);
  const files = await changedFiles(base);
  const tracked = await trackedFiles();
  const changed = new Set(files);
  const counts = await Promise.all(
    files.map(async (path) => ({ path, lines: await lineCount(path) })),
  );
  const debtCounts = await Promise.all(
    tracked
      .filter((path) => !changed.has(path) && !APPROVED_EXCEPTIONS.has(path))
      .map(async (path) => ({ path, lines: await lineCount(path) })),
  );
  const violations = counts.filter(
    ({ path, lines }) => lines > MAX_LINES && !APPROVED_EXCEPTIONS.has(path),
  );
  const approved = counts.filter(
    ({ path, lines }) => lines > MAX_LINES && APPROVED_EXCEPTIONS.has(path),
  );
  const debt = debtCounts.filter(({ lines }) => lines > MAX_LINES);
  report(violations, approved, debt);
  const status = violations.length === 0 ? "passed" : "failed";
  console.error(
    `physical line gate ${status}: base=${base} head=${head} changed=${files.length} untouchedDebt=${debt.length}`,
  );
  if (violations.length > 0) process.exitCode = 1;
};

await main().catch((error) => {
  console.error(
    `physical line gate failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
