// @ts-check
import { createHash } from "node:crypto";

const FULL_STEPS = [
  "line-limit",
  "format",
  "lint",
  "depcruise",
  "typecheck",
  "test:unit",
  "test:integration",
];
const SECTION = /^## Evidence[ \t]*\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m;
const JSON_BLOCK = /^[ \t]*```json[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/m;

/** @param {unknown} value */
const record = (value) =>
  typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : null;

/** @param {unknown} value */
const isValidStep = (value) => {
  const step = record(value);
  return (
    step !== null &&
    typeof step.name === "string" &&
    typeof step.command === "string" &&
    step.ok === true &&
    Number.isSafeInteger(step.ms) &&
    typeof step.summary === "string"
  );
};

/** Validate the immutable full Evidence payload before it can enter a PR body.
 * @param {string} raw @param {string} targetSha
 */
export const validatePublicationEvidence = (raw, targetSha) => {
  const parsed = parseEvidence(raw);
  if (parsed === undefined) return { ok: false, reason: "Evidence is not valid JSON." };
  if (!parsed) return { ok: false, reason: "Evidence must be a JSON object." };
  return (
    validateIdentity(parsed, targetSha) ??
    validateVersions(parsed) ??
    validateSteps(parsed) ??
    validateTiming(parsed) ?? { ok: true }
  );
};

/** @param {string} raw */
const parseEvidence = (raw) => {
  try {
    return record(JSON.parse(raw));
  } catch {
    return undefined;
  }
};

/** @param {Record<string, unknown>} value @param {string} targetSha */
const validateIdentity = (value, targetSha) => {
  if (value.sha !== targetSha)
    return { ok: false, reason: "Evidence sha does not equal the full target sha." };
  return value.ok === true && value.dirty === false && value.scope === "full"
    ? undefined
    : { ok: false, reason: "Evidence must be clean, successful, and full scope." };
};

/** @param {Record<string, unknown>} value */
const validateVersions = (value) => {
  const versions = record(value.versions);
  return versions && typeof versions.bun === "string" && typeof versions.surfpool === "string"
    ? undefined
    : { ok: false, reason: "Full Evidence must record Bun and Surfpool versions." };
};

/** @param {Record<string, unknown>} value */
const validateSteps = (value) => {
  if (!Array.isArray(value.steps) || value.steps.length !== FULL_STEPS.length)
    return { ok: false, reason: "Full Evidence has the wrong verification steps." };
  return value.steps.every(
    (step, index) => isValidStep(step) && record(step)?.name === FULL_STEPS[index],
  )
    ? undefined
    : { ok: false, reason: "Full Evidence steps must be ordered and successful." };
};

/** @param {Record<string, unknown>} value */
const validateTiming = (value) => {
  const isValid =
    typeof value.startedAt === "string" &&
    Number.isFinite(Date.parse(value.startedAt)) &&
    Number.isSafeInteger(value.durationMs) &&
    /** @type {number} */ (value.durationMs) >= 0;
  return isValid ? undefined : { ok: false, reason: "Evidence timing fields are invalid." };
};

/** @param {string} body */
export const evidenceRaw = (body) => {
  const section = SECTION.exec(body)?.[0];
  return section ? JSON_BLOCK.exec(section)?.[1] : undefined;
};

/** @param {string} body @param {string} targetSha */
export const hasValidTargetEvidence = (body, targetSha) => {
  const raw = evidenceRaw(body);
  return raw !== undefined && validatePublicationEvidence(raw, targetSha).ok;
};

/** Replace only Evidence, retaining every unrelated byte from the latest fetched body.
 * @param {string} body @param {string} raw
 */
export const withEvidence = (body, raw) => {
  const section = `## Evidence\n\n\`\`\`json\n${raw}\n\`\`\`\n\n`;
  if (SECTION.test(body)) return body.replace(SECTION, section);
  const separator = body.length === 0 || body.endsWith("\n") ? "" : "\n";
  return `${body}${separator}\n${section}`;
};

/** @param {string} value */
export const publicationHash = (value) => createHash("sha256").update(value).digest("hex");
