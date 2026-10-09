// @ts-check
import { redactDiagnostics, reportStepFailure } from "./diagnostics.js";

/**
 * Step runner: children run with the inherited cwd, output captured (stdout is reserved for the
 * final JSON). The first failure stops the run; later steps are reported as skipped.
 */

/** @typedef {import("./schema.js").Step} Step */
/** @typedef {{ name: string; command: string[] }} StepSpec */

const SUMMARY_MAX = 200;

/**
 * `eslint .` over the whole repo peaks above Node's default heap; constrained CI runners would
 * otherwise fail on memory rather than on code. Callers can still override the value.
 */
const DEFAULT_NODE_OPTIONS = "--max-old-space-size=6144";

/**
 * Spawn a command and capture its combined output.
 * @param {string[]} argv @param {string} [cwd] where to run it; default: the current directory
 * @returns {Promise<{ code: number; output: string }>}
 */
export const captureCommand = async (argv, cwd) => {
  try {
    const env = { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? DEFAULT_NODE_OPTIONS };
    const proc = Bun.spawn(argv, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, output: `${out}\n${err}` };
  } catch (error) {
    return { code: 127, output: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Last non-empty line of a block of text, truncated to 200 chars.
 * @param {string} text
 */
export const lastLine = (text) => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) ?? "").slice(0, SUMMARY_MAX);
};

/**
 * @param {StepSpec} spec
 * @returns {Promise<Step>}
 */
export const runStep = async (spec) => {
  const start = performance.now();
  const { code, output } = await captureCommand(spec.command);
  const safeOutput = redactDiagnostics(output);
  if (code !== 0) reportStepFailure(spec.name, { code, output: safeOutput });
  const fallback = code === 0 ? "ok" : `exit ${code}`;
  return {
    name: spec.name,
    command: spec.command.join(" "),
    ok: code === 0,
    ms: Math.round(performance.now() - start),
    summary: lastLine(safeOutput) || fallback,
  };
};

/**
 * @param {StepSpec} spec
 * @returns {Step}
 */
export const skippedStep = (spec) => ({
  name: spec.name,
  command: spec.command.join(" "),
  ok: null,
  ms: 0,
  summary: "skipped",
});

/**
 * Run steps in order, stopping at the first failure.
 * @param {StepSpec[]} specs
 * @returns {Promise<Step[]>}
 */
export const runSteps = async (specs) => {
  /** @type {Step[]} */
  const steps = [];
  let hasFailed = false;
  for (const spec of specs) {
    if (hasFailed) {
      steps.push(skippedStep(spec));
      continue;
    }
    const step = await runStep(spec);
    hasFailed = step.ok !== true;
    steps.push(step);
  }
  return steps;
};
