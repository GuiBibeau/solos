// @ts-check
import { readdirSync } from "node:fs";

/** @typedef {{ name: string, tier: string, stability: string, group: string }} ToolRow */

const CORE_SRC = new URL("../../../../packages/core/src/", import.meta.url);
/** Read before simulate before execute: the order an agent meets a slice in, not alphabetical. */
const TIER_ORDER = ["read", "simulate", "execute"];

/**
 * Every slice, from the filesystem rather than from the registry: a ports-only slice owns no
 * tools and would otherwise be invisible to the gate — exactly the drift that let five slices
 * go unlisted. `shared` is cross-slice plumbing, not a slice.
 * @returns {string[]}
 */
export const sliceNames = () =>
  readdirSync(CORE_SRC, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "shared")
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b));

/** @param {string[]} header @param {string[]} rows */
const table = (header, rows) =>
  [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows].join("\n");

/**
 * The tool table as the registry has it. `allTools` is already sorted by name for prompt-cache
 * stability (ADR-0007), so the rendering is deterministic without sorting again.
 * @param {ReadonlyArray<ToolRow>} tools
 * @returns {string}
 */
export const renderToolTable = (tools) =>
  table(
    ["Tool", "Tier", "Stability", "Slice"],
    tools.map(
      (tool) => `| \`${tool.name}\` | ${tool.tier} | ${tool.stability} | \`${tool.group}\` |`,
    ),
  );

/**
 * One row per slice with the tiers it actually reaches, so "read-only today" cannot survive the
 * commit that adds an execute tool.
 * @param {ReadonlyArray<string>} slices
 * @param {ReadonlyArray<ToolRow>} tools
 * @returns {string}
 */
export const renderSliceTable = (slices, tools) =>
  table(
    ["Slice", "Tools", "Tiers"],
    slices.map((slice) => {
      const owned = tools.filter((tool) => tool.group === slice);
      const tiers = TIER_ORDER.filter((tier) => owned.some((tool) => tool.tier === tier));
      return `| \`${slice}\` | ${owned.length} | ${owned.length === 0 ? "ports only" : tiers.join(", ")} |`;
    }),
  );
