// @ts-check
/**
 * Step runner: children run with the inherited cwd, output captured (stdout is reserved for the
 * final JSON). The first failure stops the run; later steps are reported as skipped.
 */

/** @typedef {import("./schema.js").Step} Step */
/** @typedef {{ name: string; command: string[] }} StepSpec */

const SUMMARY_MAX = 200;

/**
 * Spawn a command and capture its combined output.
 * @param {string[]} argv
 * @returns {Promise<{ code: number; output: string }>}
 */
export const captureCommand = async (argv) => {
  try {
    const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
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
  const fallback = code === 0 ? "ok" : `exit ${code}`;
  return {
    name: spec.name,
    command: spec.command.join(" "),
    ok: code === 0,
    ms: Math.round(performance.now() - start),
    summary: lastLine(output) || fallback,
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
