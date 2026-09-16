// @ts-check
/**
 * Key layout, bounds, and id handling for handoff artifacts: Markdown documents one station
 * produces and another reads, passed by id instead of pasted through the orchestrator's context.
 *
 * Ids are model-supplied on read, so {@link ARTIFACT_ID_PATTERN} is strict: without it a caller
 * could pass `../factory-brain/<hash>.md` and read a managed document through the artifact tools.
 */
import { ARTIFACTS_PREFIX } from "../blob.js";

/** Generous enough for a full analysis or a long research memo, bounded so one call can't flood the reader. */
export const MAX_ARTIFACT_LENGTH = 200_000;

export const MAX_ARTIFACT_TITLE_LENGTH = 200;

/** A closed set: the kind travels with the id, and a reader treats `analysis` differently from notes. */
export const ARTIFACT_KINDS = /** @type {const} */ (["research-notes", "analysis"]);

const SLUG_DISALLOWED = /[^a-z\d]+/g;
const SLUG_TRIM = /^-+|-+$/g;
const SLUG_MAX_LENGTH = 48;

/**
 * Anchored, no dots or slashes, so a validated id cannot traverse out of {@link ARTIFACTS_PREFIX}.
 */
export const ARTIFACT_ID_PATTERN = /^[a-z\d]+(?:-[a-z\d]+)*$/;

const SUFFIX_LENGTH = 6;

/**
 * The slug portion of an id. The length cap is applied before the trim so a cut on a hyphen
 * can't produce `--` in front of the suffix.
 * @param {string} title
 */
const slugify = (title) =>
  title
    .toLowerCase()
    .replaceAll(SLUG_DISALLOWED, "-")
    .slice(0, SLUG_MAX_LENGTH)
    .replaceAll(SLUG_TRIM, "") || "untitled";

/**
 * A readable id for a newly saved artifact: `<kind>-<slug>-<suffix>`.
 * @param {string} kind
 * @param {string} title
 */
export const artifactId = (kind, title) => {
  const suffix = Math.random()
    .toString(36)
    .slice(2, 2 + SUFFIX_LENGTH)
    .padEnd(SUFFIX_LENGTH, "0");
  return `${kind}-${slugify(title)}-${suffix}`;
};

/**
 * The Blob key for an id, or `null` when the id fails validation. Callers treat `null` as
 * "not found" so a probe learns nothing from the difference.
 * @param {string} id
 * @returns {string | null}
 */
export const artifactKey = (id) =>
  ARTIFACT_ID_PATTERN.test(id) ? `${ARTIFACTS_PREFIX}${id}.md` : null;
