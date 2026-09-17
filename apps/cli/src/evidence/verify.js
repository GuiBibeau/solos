// @ts-check
import { blockedIrisQa, runIrisQa } from "../qa/iris.js";
import { gitInfo, toolVersions } from "./git-info.js";
import { runSteps, skippedStep } from "./run-steps.js";
import { EvidenceSchema, REQUIRED_STEPS } from "./schema.js";

/** @typedef {import("./schema.js").Scope} Scope */
/** @typedef {import("./schema.js").Evidence} Evidence */
/** @typedef {import("./run-steps.js").StepSpec} StepSpec */

/**
 * Repo scripts are the source of truth (root package.json); each step runs one of them, the step
 * name doubling as the script name unless `SCRIPT_FOR_STEP` says otherwise.
 * @param {string} name
 * @returns {StepSpec}
 */
const script = (name) => ({
  name,
  command: ["bun", "run", "--silent", SCRIPT_FOR_STEP[name] ?? name],
});

/**
 * Step name → package.json script. Names are the contract (`REQUIRED_STEPS`); scripts may move.
 * @type {Record<string, string>}
 */
const SCRIPT_FOR_STEP = {
  format: "format:check",
  lint: "lint",
  depcruise: "depcruise",
  typecheck: "typecheck",
  "test:unit": "test:unit",
  "test:integration": "test:integration",
};

/** @type {Record<Scope, StepSpec[]>} */
export const STEPS_BY_SCOPE = {
  check: REQUIRED_STEPS.check.map(script),
  unit: REQUIRED_STEPS.unit.map(script),
  full: REQUIRED_STEPS.full.map(script),
};

/**
 * `full` needs Surfpool: fail fast with a synthetic step instead of letting bun test time out.
 * @param {Scope} scope
 * @param {StepSpec[]} specs
 */
const runScoped = (scope, specs) => {
  if (scope !== "full" || Bun.which("surfpool")) return runSteps(specs);
  const missing = {
    name: "surfpool",
    command: "surfpool --version",
    ok: false,
    ms: 0,
    summary: "surfpool not on PATH",
  };
  return Promise.resolve([missing, ...specs.map(skippedStep)]);
};

/**
 * Run the verification contract and return validated Evidence.
 * @param {Scope} scope
 * @param {{ qa?: "iris" | "elfa-market" }} [options]
 * @returns {Promise<Evidence>}
 */
export const runVerify = async (scope, { qa: suite } = {}) => {
  const startedAt = new Date();
  const [{ sha, dirty }, versions] = await Promise.all([gitInfo(), toolVersions()]);
  const steps = await runScoped(scope, STEPS_BY_SCOPE[scope]);
  const checksPassed = steps.every((step) => step.ok === true);
  const qa = suite ? await verifyIris(checksPassed && !dirty, suite) : undefined;
  const finalGit = await gitInfo();
  return EvidenceSchema.parse({
    ok: passedQa(checksPassed, qa) && finalGit.sha === sha && !finalGit.dirty,
    sha,
    dirty: dirty || finalGit.dirty,
    scope,
    versions,
    steps,
    qa,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  });
};

/** @param {boolean} checksPassed @param {import("../qa/schema.js").IrisQa | undefined} qa */
const passedQa = (checksPassed, qa) => checksPassed && (!qa || qa.status === "passed");

/** @param {boolean} ready @param {"iris" | "elfa-market"} suite */
const verifyIris = async (ready, suite) => {
  if (!ready)
    return blockedIrisQa(
      "Live QA requires a clean commit and passing offline checks",
      undefined,
      suite,
    );
  try {
    return await runIrisQa({ apiKey: process.env.ELFA_API_KEY, suite });
  } catch {
    return blockedIrisQa(
      "QA setup or execution failed; check Bun and Surfpool installation",
      undefined,
      suite,
    );
  }
};
