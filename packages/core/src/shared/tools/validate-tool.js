// @ts-check
const NAME = /^solana_[a-z]+_[a-z]+(_[a-z]+)*$/;
const MIN_DESCRIPTION = 40;

/**
 * Discovery-friendliness rules from ADR-0007, enforced by a test over every tool.
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
  problems.push(...undocumentedFields(tool));
  return problems;
};

/** @param {import("./define-tool.js").AnyToolDefinition} tool */
const undocumentedFields = (tool) =>
  Object.entries(tool.input.shape)
    .filter(([, field]) => (field.description ?? "").length === 0)
    .map(([key]) => `argument "${key}" has no description`);
