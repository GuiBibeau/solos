// @ts-check
/**
 * Release notes from what was merged: squash subjects `type(scope): title (#NNN)` since the
 * last tag, grouped by type, plus what changed in the generated tool reference (added, removed
 * and changed rows, which is where a stability label shows up). Pure over the texts.
 */

/** @typedef {{ type: string; scope: string | null; title: string; pr: number | null }} Entry */
/** @typedef {{ added: string[]; removed: string[]; changed: string[] }} ToolDiff */

const SUBJECT =
  /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?!?:\s*(?<title>.*?)(?:\s*\(#(?<pr>\d+)\))?$/u;
const ORDER = new Set(["feat", "fix", "perf", "refactor", "docs", "chore", "test", "ci", "build"]);
/** @type {Record<string, string>} */
const HEADINGS = {
  feat: "Features",
  fix: "Fixes",
  perf: "Performance",
  refactor: "Refactoring",
  docs: "Documentation",
  chore: "Chores",
  test: "Tests",
  ci: "CI",
  build: "Build",
  other: "Other",
};
const TOOL_ROW = /^\|\s*`([^`]+)`\s*\|/u;

/** @param {string} line @returns {Entry} */
const parseSubject = (line) => {
  const groups = SUBJECT.exec(line)?.groups;
  if (groups === undefined) return { type: "other", scope: null, title: line, pr: null };
  return {
    type: groups.type ?? "other",
    scope: groups.scope ?? null,
    title: groups.title ?? line,
    pr: groups.pr === undefined ? null : Number(groups.pr),
  };
};

/** One subject per line, as `git log --format=%s` prints them. @param {string} log */
export const parseSubjects = (log) =>
  log
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseSubject);

/** @param {ReadonlyArray<Entry>} entries */
export const groupByType = (entries) => {
  /** @type {Map<string, Entry[]>} */
  const groups = new Map();
  for (const entry of entries) {
    const key = ORDER.has(entry.type) ? entry.type : "other";
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...ORDER, "other"]
    .filter((key) => groups.has(key))
    .map((key) => ({ type: key, heading: HEADINGS[key] ?? key, entries: groups.get(key) ?? [] }));
};

/** Tool name to its table row, from a generated reference table. @param {string} markdown */
export const toolRows = (markdown) => {
  /** @type {Map<string, string>} */
  const rows = new Map();
  for (const line of markdown.split("\n")) {
    const match = TOOL_ROW.exec(line);
    if (match !== null) rows.set(/** @type {string} */ (match[1]), line.trim());
  }
  return rows;
};

/** @param {Map<string, string>} before @param {Map<string, string>} after @returns {ToolDiff} */
export const diffToolRows = (before, after) => {
  /** @type {ToolDiff} */
  const diff = { added: [], removed: [], changed: [] };
  for (const [name, row] of after) {
    if (!before.has(name)) diff.added.push(name);
    else if (before.get(name) !== row) diff.changed.push(name);
  }
  for (const name of before.keys()) {
    if (!after.has(name)) diff.removed.push(name);
  }
  return diff;
};

/** @param {Entry} entry */
const bullet = (entry) => {
  const scope = entry.scope === null ? "" : `${entry.scope}: `;
  const pr = entry.pr === null ? "" : ` (#${entry.pr})`;
  return `- ${scope}${entry.title}${pr}`;
};

/** @param {ToolDiff} diff */
const toolsSection = (diff) => {
  const lines = [
    ...diff.added.map((name) => `- Added \`${name}\``),
    ...diff.removed.map((name) => `- Removed \`${name}\``),
    ...diff.changed.map((name) => `- Changed \`${name}\``),
  ];
  return lines.length === 0 ? [] : ["## Tools", "", ...lines, ""];
};

const MIGRATION_PLACEHOLDER =
  "<!-- Required for a major: what changes for users and how they move. -->";

/**
 * @param {{ version: string; since: string; entries: ReadonlyArray<Entry>; toolDiff: ToolDiff; major: boolean }} input
 */
export const renderNotes = ({ version, since, entries, toolDiff, major }) => {
  const body = groupByType(entries).flatMap((group) => [
    `## ${group.heading}`,
    "",
    ...group.entries.map(bullet),
    "",
  ]);
  const migration = major ? ["## Migration", "", MIGRATION_PLACEHOLDER, ""] : [];
  return [
    `# solos ${version}`,
    "",
    `Changes since ${since}.`,
    "",
    ...body,
    ...toolsSection(toolDiff),
    ...migration,
  ]
    .join("\n")
    .trimEnd();
};
