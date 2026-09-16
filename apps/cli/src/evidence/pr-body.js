// @ts-check
/**
 * Pull-request bodies carry the Evidence under `## Evidence` in a json fenced block. CI parses it
 * here and asserts it belongs to the commit under review, from a clean tree, and passed.
 */
import { EvidenceSchema, REQUIRED_STEPS } from "./schema.js";

/** @typedef {import("./schema.js").Evidence} Evidence */
/** @typedef {{ ok: true; evidence: Evidence } | { ok: false; reason: string; evidence?: unknown }} EvidenceCheck */

const MIN_SHA_PREFIX = 7;

/**
 * Text of the `## Evidence` section, up to the next `## ` heading.
 * @param {string} body
 */
export const evidenceSection = (body) => {
  const match = /^## Evidence[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
  return match?.[1];
};

/**
 * Raw text of the first json-tagged fenced code block in a markdown fragment.
 * @param {string} markdown
 */
export const firstJsonBlock = (markdown) => {
  const match = /^[ \t]*```json[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/m.exec(markdown);
  return match?.[1];
};

/**
 * Two shas match when one is a prefix of the other and at least 7 chars are compared.
 * @param {string} a @param {string} b
 */
export const shaMatches = (a, b) => {
  const n = Math.min(a.length, b.length);
  return n >= MIN_SHA_PREFIX && a.slice(0, n) === b.slice(0, n);
};

/** @param {string} text @returns {{ value?: unknown; reason?: string }} */
const parseJson = (text) => {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { reason: `evidence block is not valid JSON: ${String(error)}` };
  }
};

/**
 * @param {Evidence} evidence @param {string} sha
 * @returns {string | undefined}
 */
const assertEvidence = (evidence, sha) => {
  if (!shaMatches(evidence.sha, sha))
    return `sha mismatch: evidence ${evidence.sha}, expected ${sha}`;
  if (evidence.dirty) return "evidence was produced from a dirty working tree";
  if (!evidence.ok) return "evidence reports a failed verification";
  return assertSteps(evidence);
};

/**
 * The declared scope must show exactly its required steps, in order, each passed. Without this a
 * hand-written `{ ok: true, steps: [] }` would count as proof.
 * @param {Evidence} evidence
 * @returns {string | undefined}
 */
const assertSteps = (evidence) => {
  const expected = REQUIRED_STEPS[evidence.scope];
  const names = evidence.steps.map((step) => step.name);
  if (names.length !== expected.length || names.some((name, i) => name !== expected[i])) {
    return `scope ${evidence.scope} requires steps [${expected.join(", ")}], evidence has [${names.join(", ")}]`;
  }
  const failed = evidence.steps.find((step) => step.ok !== true);
  return failed === undefined ? undefined : `step ${failed.name} did not pass`;
};

/**
 * Locate, parse, and assert the Evidence pasted in a PR body.
 * @param {string} body @param {string} sha
 * @returns {EvidenceCheck}
 */
export const checkPrBody = (body, sha) => {
  const section = evidenceSection(body);
  if (section === undefined) return { ok: false, reason: "missing `## Evidence` section" };
  const block = firstJsonBlock(section);
  if (block === undefined) return { ok: false, reason: "no ```json block under `## Evidence`" };
  const json = parseJson(block);
  if (json.reason !== undefined) return { ok: false, reason: json.reason };
  const parsed = EvidenceSchema.safeParse(json.value);
  if (!parsed.success) {
    return { ok: false, reason: `evidence does not match schema: ${parsed.error.message}` };
  }
  const reason = assertEvidence(parsed.data, sha);
  return reason === undefined
    ? { ok: true, evidence: parsed.data }
    : { ok: false, reason, evidence: parsed.data };
};
