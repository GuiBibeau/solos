// @ts-check
/**
 * The tool catalogue as Markdown for `llms-full.txt`: what an agent reads when it fetches the
 * site's llms.txt and wants the whole surface in one pass. Generated from the registry like the
 * HTML reference, and gated the same way.
 */
import { groupsOf } from "./render-html.js";
import { argumentsOf } from "./render-schema.js";

/** @typedef {import("./render-html.js").ToolDoc} ToolDoc */

/** @param {import("./render-schema.js").ArgumentRow} row */
const argumentLine = (row) => {
  const flag = row.required ? "required" : "optional";
  const meta = row.meta ? `; ${row.meta}` : "";
  return `- \`${row.name}\` (${row.type}, ${flag}): ${row.description}${meta}`;
};

/** @param {ToolDoc} tool */
const renderTool = (tool) => {
  const rows = argumentsOf(tool.input);
  const args = rows.length === 0 ? ["No arguments."] : rows.map(argumentLine);
  return [
    `### ${tool.name}`,
    "",
    `Tier: ${tool.tier}. Stability: ${tool.stability}. ${tool.title}.`,
    "",
    tool.description,
    "",
    ...args,
  ].join("\n");
};

/**
 * One H2 per group, one H3 per tool, arguments as a list. Headings carry the bare tool name so
 * the docs gate can name drift.
 * @param {ReadonlyArray<ToolDoc>} tools
 * @returns {string}
 */
export const renderToolsMarkdown = (tools) =>
  groupsOf(tools)
    .map((group) => {
      const owned = tools.filter((tool) => tool.group === group);
      return [`## ${group}`, ...owned.map(renderTool)].join("\n\n");
    })
    .join("\n\n");
