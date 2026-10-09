// @ts-check
/**
 * The rule a stability label must obey (ADR-0036): an execute or simulate tool may call itself
 * stable only when the Action it builds has a live-validated row in features/feature-map.json,
 * so a label cannot outrun a funded round. Pure over the registry and the rows; the gate reads
 * the file.
 */

/** @typedef {{ name: string; tier: string; stability: string; action?: string }} LabelledTool */
/** @typedef {{ status?: string; action?: string }} FeatureRow */
/** @typedef {{ tool: string; reason: string; remedy: string }} StabilityProblem */

/** The Action types a funded round has recorded. @param {ReadonlyArray<FeatureRow>} rows */
export const liveValidatedActions = (rows) =>
  new Set(
    rows
      .filter((row) => row.status === "live-validated" && typeof row.action === "string")
      .map((row) => /** @type {string} */ (row.action)),
  );

/**
 * @param {ReadonlyArray<LabelledTool>} tools
 * @param {ReadonlySet<string>} validated
 * @returns {StabilityProblem[]}
 */
export const stabilityProblems = (tools, validated) =>
  tools
    .filter(
      (tool) =>
        tool.stability === "stable" && tool.tier !== "read" && !validated.has(tool.action ?? ""),
    )
    .map((tool) => ({
      tool: tool.name,
      reason: `${tool.name} is stable but its Action ${tool.action ?? "(none)"} has no live-validated row in features/feature-map.json`,
      remedy: "record a funded round for that Action in the feature map, or label the tool beta",
    }));
