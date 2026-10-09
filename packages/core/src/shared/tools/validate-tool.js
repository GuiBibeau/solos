// @ts-check
import { STABILITIES } from "./define-tool.js";

const NAME = /^solana_[a-z]+_[a-z]+(_[a-z]+)*$/;
const MIN_DESCRIPTION = 40;

/**
 * The label every tool carries and the Action a simulate or execute tool names (ADR-0036).
 * @param {import("./define-tool.js").AnyToolDefinition} tool
 */
const labelProblems = (tool) => {
  const problems = [];
  if (!STABILITIES.includes(tool.stability)) {
    problems.push(`stability must be one of ${STABILITIES.join(", ")}`);
  }
  if (tool.tier !== "read" && (tool.action ?? "").length === 0) {
    problems.push("a simulate or execute tool names the Action type it builds in action");
  }
  if (tool.tier === "read" && tool.action !== undefined) {
    problems.push("a read tool builds no Action; drop action");
  }
  return problems;
};

/**
 * Discovery-friendliness rules from ADR-0007 and the label rules from ADR-0036, enforced by a
 * test over every tool.
 * @param {import("./define-tool.js").AnyToolDefinition} tool
 * @returns {string[]} problems, empty when valid
 */
export const validateTool = (tool) => {
  const problems = [];
  if (!NAME.test(tool.name)) problems.push(`name "${tool.name}" must match ${NAME}`);
  if (!tool.name.startsWith(`solana_${tool.group}_`)) {
    problems.push(`name must start with solana_${tool.group}_`);
  }
  if (tool.description.length < MIN_DESCRIPTION) {
    problems.push("description too short to be searchable");
  }
  problems.push(...undocumentedFields(tool), ...labelProblems(tool));
  return problems;
};

/** @param {import("./define-tool.js").AnyToolDefinition} tool */
const undocumentedFields = (tool) =>
  Object.entries(tool.input.shape)
    .filter(([, field]) => (field.description ?? "").length === 0)
    .map(([key]) => `argument "${key}" has no description`);
