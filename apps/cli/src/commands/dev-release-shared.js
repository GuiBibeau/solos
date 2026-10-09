// @ts-check
/** What the `solos dev release` verbs share: the git reads, the base version and the option shapes. */
import { Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { captureCommand } from "../evidence/run-steps.js";
import { ReleaseRefused } from "../release/errors.js";
import { newestStable, parseVersion } from "../release/version.js";

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
  const newest = newestStable((await git(["tag", "--list", "solos@*"])).split("\n"));
  if (newest === null) {
    throw new ReleaseRefused({
      reason: "no solos@<semver> tag is reachable",
      remedy: "git fetch --tags, or pass --base <version>",
    });
  }
  return newest;
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
