// @ts-check
/** What the `solos dev release` verbs share: the git reads, the base version and the option shapes. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { captureCommand } from "../evidence/run-steps.js";
import { ReleaseRefused } from "../release/errors.js";
import { diffToolRows, parseSubjects, renderNotes, toolRows } from "../release/notes.js";
import { isMajor, newestStable, parseVersion } from "../release/version.js";

/** The generated tool reference whose rows the notes diff. */
export const TOOL_REFERENCE = "docs/reference/tools/index.md";

/**
 * A promise whose thrown error is the failure itself, so a `ReleaseRefused` keeps its envelope.
 * @template A
 * @param {() => Promise<A>} thunk
 */
export const attempt = (thunk) => Effect.tryPromise({ try: thunk, catch: (error) => error });

/** @param {string[]} argv */
export const git = async (argv) => {
  const { code, output } = await captureCommand(["git", ...argv]);
  if (code !== 0) {
    throw new ReleaseRefused({
      reason: `git ${argv[0] ?? ""} failed: ${output.trim().split("\n").at(-1) ?? ""}`,
      remedy: "run inside the solos checkout with its tags fetched",
    });
  }
  return output;
};

/** `git show <ref>:<path>`, or an empty string when the ref has no such file. @param {string} spec */
export const gitShowOrEmpty = async (spec) => {
  const { code, output } = await captureCommand(["git", "show", spec]);
  return code === 0 ? output : "";
};

/**
 * The newest stable `solos@*` tag reachable from HEAD: the release history a gate derives from,
 * which no flag overrides. A tag on another branch is someone else's future, not this history.
 */
export const newestRelease = async () => {
  const tags = await git(["tag", "--list", "--merged", "HEAD", "solos@*"]);
  const newest = newestStable(tags.split("\n"));
  if (newest === null) {
    throw new ReleaseRefused({
      reason: "no solos@<semver> tag is reachable",
      remedy: "git fetch --tags so the newest stable release is reachable",
    });
  }
  return newest;
};

/**
 * The stable version a lane derives from: `--base` when given, else the newest `solos@*` tag.
 * @param {Option.Option<string>} base
 */
export const baseVersion = async (base) => {
  if (Option.isSome(base)) {
    const parsed = parseVersion(base.value);
    if (parsed === null || parsed.prerelease !== null) {
      throw new ReleaseRefused({
        reason: `--base ${base.value} is not a stable semver version`,
        remedy: "pass --base <major.minor.patch>, the stable release to derive from",
      });
    }
    return parsed;
  }
  return newestRelease();
};

/**
 * @template A
 * @param {Option.Option<A>} option @param {string} flag
 */
export const required = (option, flag) => {
  if (Option.isNone(option)) {
    throw new ReleaseRefused({
      reason: `${flag} is required for this lane`,
      remedy: `pass ${flag}`,
    });
  }
  return option.value;
};

export const dryRun = Options.boolean("dry-run").pipe(
  Options.withDefault(false),
  Options.withDescription("Print the commands without running them"),
);

/** @param {string} path */
export const readIfPresent = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);

/** The entries of a directory, none when it does not exist. @param {string} dir */
export const listDir = (dir) => (existsSync(dir) ? readdirSync(dir) : []);

/**
 * A malformed manifest is a release problem with a remedy, never a parser error across the CLI
 * boundary. A missing file reads as an empty manifest so the version checks name what is absent.
 * @param {string | null} text
 * @returns {{ value: unknown; problems: Array<{ reason: string; remedy: string }> }}
 */
export const parseManifest = (text) => {
  if (text === null) return { value: {}, problems: [] };
  try {
    return { value: JSON.parse(text), problems: [] };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      value: {},
      problems: [
        {
          reason: `server.json is not valid JSON: ${detail}`,
          remedy: "fix server.json; it must name the release version in both of its version fields",
        },
      ],
    };
  }
};

/**
 * The release notes for `version`, from the merges since `since` and the tool reference diff
 * against that tag.
 * @param {string} version @param {string} since a `solos@x.y.z` tag
 */
export const composeNotes = async (version, since) => {
  const entries = parseSubjects(await git(["log", `${since}..HEAD`, "--format=%s", "--no-merges"]));
  const before = toolRows(await gitShowOrEmpty(`${since}:${TOOL_REFERENCE}`));
  const after = toolRows(readIfPresent(TOOL_REFERENCE) ?? "");
  const toolDiff = diffToolRows(before, after);
  const major = isMajor(version, parseVersion(since.replace(/^solos@/u, "")));
  const markdown = renderNotes({ version, since, entries, toolDiff, major });
  return { since, entries: entries.length, toolDiff, major, markdown };
};

/** A release PR carries only server.json and the notes, so the tree must be clean before it starts. */
export const assertCleanTree = async () => {
  const status = (await git(["status", "--porcelain"])).trim();
  if (status.length === 0) return;
  throw new ReleaseRefused({
    reason: "the working tree has uncommitted changes",
    remedy: "commit or stash them first; prepare commits only server.json and the notes file",
  });
};

/** @param {string} value @param {string} flag */
export const semver = (value, flag) => {
  if (parseVersion(value) === null) {
    throw new ReleaseRefused({
      reason: `${flag} ${value} is not a semver version`,
      remedy: `pass ${flag} <major.minor.patch>`,
    });
  }
  return value;
};

/** The stable lane's versions only: `latest` never points at a canary, and never rolls back from one. */
export const stable = (/** @type {string} */ value, /** @type {string} */ flag) => {
  if (parseVersion(semver(value, flag))?.prerelease !== null) {
    throw new ReleaseRefused({
      reason: `${flag} ${value} is a prerelease; latest only ever points at a stable version`,
      remedy: `pass a stable ${flag}, with no prerelease suffix`,
    });
  }
  return value;
};
