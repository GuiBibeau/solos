// @ts-check
import { gitInfo, toolVersions } from "./git-info.js";
import { runSteps, skippedStep } from "./run-steps.js";
import { EvidenceSchema } from "./schema.js";

/** @typedef {import("./schema.js").Scope} Scope */
/** @typedef {import("./schema.js").Evidence} Evidence */
/** @typedef {import("./run-steps.js").StepSpec} StepSpec */

/**
 * Repo scripts are the source of truth (root package.json); each step runs one of them.
 * @param {string} name @param {string} script
 * @returns {StepSpec}
 */
const script = (name, script) => ({ name, command: ["bun", "run", "--silent", script] });

const CHECK_STEPS = [
  script("format", "format:check"),
  script("lint", "lint"),
  script("depcruise", "depcruise"),
  script("typecheck", "typecheck"),
];

/** @type {Record<Scope, StepSpec[]>} */
export const STEPS_BY_SCOPE = {
  check: CHECK_STEPS,
  unit: [...CHECK_STEPS, script("test:unit", "test:unit")],
  full: [
    ...CHECK_STEPS,
    script("test:unit", "test:unit"),
    script("test:integration", "test:integration"),
  ],
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
 * @returns {Promise<Evidence>}
 */
export const runVerify = async (scope) => {
  const startedAt = new Date();
  const [{ sha, dirty }, versions] = await Promise.all([gitInfo(), toolVersions()]);
  const steps = await runScoped(scope, STEPS_BY_SCOPE[scope]);
  return EvidenceSchema.parse({
    ok: steps.every((step) => step.ok === true),
    sha,
    dirty,
    scope,
    versions,
    steps,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  });
};
