// @ts-check
/**
 * The landing site's tool reference, rendered from the registry. Same contract as the markdown
 * tables: the region is generated, the prose around it is written by hand, and the docs gate
 * fails when they drift.
 */
import { argumentsOf } from "./render-schema.js";

/**
 * @typedef {{ name: string, group: string, tier: string, stability: string, title: string,
 *   description: string, input: import("zod").ZodObject }} ToolDoc
 */

/** @param {unknown} value */
const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** @param {import("./render-schema.js").ArgumentRow} row */
const argumentRow = (row) =>
  `<tr><td><code>${escapeHtml(row.name)}</code></td><td>${escapeHtml(row.type)}</td>` +
  `<td>${row.required ? "yes" : "no"}</td>` +
  `<td>${escapeHtml(row.description)}${row.meta ? ` <span class="meta">${escapeHtml(row.meta)}</span>` : ""}</td></tr>`;

/**
 * The table sits in a focusable, named scroll region: on a narrow screen it overflows sideways and
 * keyboard users must be able to reach it, and the table itself keeps its native semantics.
 * @param {import("zod").ZodObject} input @param {string} name
 */
const renderArguments = (input, name) => {
  const rows = argumentsOf(input);
  if (rows.length === 0) return '<p class="noargs">No arguments.</p>';
  return [
    `<div class="table-wrap" tabindex="0" role="region" aria-label="Arguments of ${escapeHtml(name)}">`,
    '<table class="args"><thead><tr><th scope="col">Argument</th><th scope="col">Type</th>',
    '<th scope="col">Required</th><th scope="col">Description</th></tr></thead>',
    `<tbody>${rows.map(argumentRow).join("")}</tbody></table></div>`,
  ].join("");
};

/** @param {ToolDoc} tool */
const renderTool = (tool) =>
  [
    `<article class="tool" id="${escapeHtml(tool.name)}">`,
    `<h3><code>${escapeHtml(tool.name)}</code> <span class="tier tier-${escapeHtml(tool.tier)}">${escapeHtml(tool.tier)}</span> <span class="stability stability-${escapeHtml(tool.stability)}">${escapeHtml(tool.stability)}</span></h3>`,
    `<p class="title">${escapeHtml(tool.title)}</p>`,
    `<p class="desc">${escapeHtml(tool.description)}</p>`,
    renderArguments(tool.input, tool.name),
    "</article>",
  ].join("\n");

/** Groups in first-seen order; `allTools` is sorted by name, so that is alphabetical. @param {ReadonlyArray<ToolDoc>} tools */
export const groupsOf = (tools) => [...new Set(tools.map((tool) => tool.group))];

/** @param {string} group @param {ReadonlyArray<ToolDoc>} owned */
const renderGroup = (group, owned) =>
  [
    `<section class="group" id="${escapeHtml(group)}">`,
    `<h2><code>${escapeHtml(group)}</code> <span class="count">${owned.length} ${owned.length === 1 ? "tool" : "tools"}</span></h2>`,
    ...owned.map(renderTool),
    "</section>",
  ].join("\n");

/**
 * The whole reference: a group index, then one section per group with one article per tool
 * carrying its tier, description and arguments as the registry declares them.
 * @param {ReadonlyArray<ToolDoc>} tools
 * @returns {string}
 */
export const renderToolsHtml = (tools) => {
  const groups = groupsOf(tools);
  const index = groups
    .map((group) => `<a href="#${escapeHtml(group)}">${escapeHtml(group)}</a>`)
    .join("\n");
  const sections = groups.map((group) =>
    renderGroup(
      group,
      tools.filter((tool) => tool.group === group),
    ),
  );
  return [`<nav class="toc" aria-label="Tool groups">\n${index}\n</nav>`, ...sections].join("\n");
};
