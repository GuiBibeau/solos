// @ts-check
/**
 * What a release PR must carry before it may merge (ADR-0036): a `release/x.y.z` branch,
 * `server.json` naming that version twice, the notes file, and for a major a filled Migration
 * section and an ADR that exists under docs/adr/. Pure over the texts; the command reads the files.
 */
import { compareVersions, formatVersion, isMajor, parseVersion } from "./version.js";

/** @typedef {{ reason: string; remedy: string }} Problem */
/** @typedef {import("./version.js").Version} Version */
/** @typedef {{ branch: string; serverJson: unknown; notes: string | null; previous?: Version | null; adrs?: string[] }} CheckInput */
/** @typedef {{ version?: unknown; packages?: Array<{ version?: unknown }> }} Manifest */

const BRANCH = /^release\/(.+)$/u;
const ADR_REF = /docs\/adr\/(\d{4})-|ADR-(\d{4})/gu;

/**
 * The stable version a `release/<major.minor.patch>` branch names, or null: a prerelease is not a
 * release PR, so it never reaches the major rules below.
 * @param {string} branch
 */
export const releaseBranchVersion = (branch) => {
  const match = BRANCH.exec(branch);
  if (match === null) return null;
  const version = /** @type {string} */ (match[1]);
  const parsed = parseVersion(version);
  return parsed === null || parsed.prerelease !== null ? null : version;
};

/** @param {unknown} serverJson @param {string} version @returns {Problem[]} */
const manifestProblems = (serverJson, version) => {
  const manifest = /** @type {Manifest} */ (serverJson ?? {});
  /** @type {Problem[]} */
  const problems = [];
  if (manifest.version !== version) {
    problems.push({
      reason: `server.json version is ${String(manifest.version)}, the branch says ${version}`,
      remedy: `set server.json "version" to ${version}`,
    });
  }
  const packaged = manifest.packages?.[0]?.version;
  if (packaged !== version) {
    problems.push({
      reason: `server.json packages[0].version is ${String(packaged)}, the branch says ${version}`,
      remedy: `set server.json packages[0].version to ${version}`,
    });
  }
  return problems;
};

/** Markdown the reader never sees as prose: HTML comments and fenced code blocks. @param {string} text */
const withoutComments = (text) =>
  text.replaceAll(/<!--[\s\S]*?-->/gu, "").replaceAll(/^```[\s\S]*?^```[ \t]*$/gmu, "");

/**
 * The text under `## Migration` up to the next heading, with HTML comments removed, so the
 * generated placeholder does not count as a filled section.
 * @param {string} raw
 */
const migrationBody = (raw) => {
  const notes = withoutComments(raw);
  const start = notes.search(/^## Migration\s*$/mu);
  if (start === -1) return null;
  const rest = notes.slice(start).split("\n").slice(1);
  const end = rest.findIndex((line) => /^#{1,2} /u.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n");
  return body.trim();
};

/** The four-digit ADR numbers the notes refer to, as `docs/adr/NNNN-` or `ADR-NNNN`. @param {string} notes */
const adrReferences = (notes) => {
  /** @type {string[]} */
  const numbers = [];
  for (const match of notes.matchAll(ADR_REF)) {
    numbers.push(/** @type {string} */ (match[1] ?? match[2]));
  }
  return numbers;
};

/**
 * A major names the ADR that decided the break, and that ADR exists: a typo or an invented
 * number is a missing ADR, not a link.
 * @param {string} notes @param {string} version @param {string[]} adrs @returns {Problem[]}
 */
const adrProblems = (notes, version, adrs) => {
  const file = `docs/releases/${version}.md`;
  const referenced = adrReferences(notes);
  if (referenced.length === 0) {
    return [
      {
        reason: `${version} is a major and ${file} names no ADR`,
        remedy: "link the ADR that decided the break, e.g. docs/adr/00NN-<slug>.md",
      },
    ];
  }
  const known = new Set(adrs.map((name) => name.slice(0, 4)));
  const missing = [...new Set(referenced.filter((number) => !known.has(number)))];
  if (missing.length === 0) return [];
  return [
    {
      reason: `${file} refers to ADR ${missing.join(", ")}; docs/adr/ has no such decision`,
      remedy: "link an ADR that exists under docs/adr/, checking the number and the path",
    },
  ];
};

/** @param {string} notes @param {string} version @param {string[]} adrs @returns {Problem[]} */
const majorProblems = (notes, version, adrs) => {
  const file = `docs/releases/${version}.md`;
  /** @type {Problem[]} */
  const problems = [];
  const migration = migrationBody(notes);
  if (migration === null || migration.length === 0) {
    problems.push({
      reason: `${version} is a major and ${file} has no filled "## Migration" section`,
      remedy: "write what changes for users and how they move, under ## Migration",
    });
  }
  return [...problems, ...adrProblems(withoutComments(notes), version, adrs)];
};

/** @typedef {{ previous: Version | null; adrs: string[] }} NotesContext */

/** @param {string | null} notes @param {string} version @param {NotesContext} context @returns {Problem[]} */
const notesProblems = (notes, version, { previous, adrs }) => {
  if (notes === null) {
    const file = `docs/releases/${version}.md`;
    return [
      {
        reason: `${file} is missing`,
        remedy: `run solos dev release notes ${version} --out ${file}`,
      },
    ];
  }
  return isMajor(version, previous) ? majorProblems(notes, version, adrs) : [];
};

/** A release PR moves forward from the previous stable release. @param {string} version @param {Version | null} previous @returns {Problem[]} */
const forwardProblems = (version, previous) => {
  const parsed = /** @type {Version} */ (parseVersion(version));
  if (previous === null || compareVersions(parsed, previous) > 0) return [];
  return [
    {
      reason: `${version} is not newer than the previous stable release ${formatVersion(previous)}`,
      remedy:
        "bump past the newest solos@ tag; solos dev release version --lane stable names the next one",
    },
  ];
};

/**
 * @param {CheckInput} input
 * @returns {{ ok: boolean; version: string | null; major: boolean; problems: Problem[] }}
 */
export const checkReleasePr = ({ branch, serverJson, notes, previous = null, adrs = [] }) => {
  const version = releaseBranchVersion(branch);
  if (version === null) {
    const problem = {
      reason: `branch ${branch} is not release/<major.minor.patch>`,
      remedy:
        "check out release/<major.minor.patch>, set both server.json versions to it and write docs/releases/<version>.md with solos dev release notes",
    };
    return { ok: false, version: null, major: false, problems: [problem] };
  }
  const problems = [
    ...forwardProblems(version, previous),
    ...manifestProblems(serverJson, version),
    ...notesProblems(notes, version, { previous, adrs }),
  ];
  return { ok: problems.length === 0, version, major: isMajor(version, previous), problems };
};
