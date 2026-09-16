// @ts-check
/** @typedef {import("./schema.js").Evidence} Evidence */
/** @typedef {import("./schema.js").Step} Step */

/** @param {Step["ok"]} ok */
const mark = (ok) => {
  if (ok === null) return "--  ";
  return ok ? "ok  " : "FAIL";
};

/** @param {number} ms */
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

/** @param {Step} step @param {number} width */
const row = (step, width) =>
  `  ${mark(step.ok)} ${step.name.padEnd(width)} ${seconds(step.ms).padStart(7)}  ${step.summary}`;

/**
 * Compact human table for stderr. The JSON on stdout stays the deliverable.
 * @param {Evidence} evidence
 */
export const formatTable = (evidence) => {
  const width = Math.max(...evidence.steps.map((step) => step.name.length), 4);
  const tree = evidence.dirty ? "dirty" : "clean";
  const head = `verify ${evidence.scope}  ${evidence.sha.slice(0, 7)} (${tree})  ${evidence.ok ? "ok" : "FAILED"}  ${seconds(evidence.durationMs)}`;
  return `${[head, ...evidence.steps.map((step) => row(step, width))].join("\n")}\n`;
};
