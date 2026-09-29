// @ts-check
import { isWithinCeiling } from "@solos/core";
import { BOOTSTRAP_TOOLS, SEARCH_TOOL } from "./discovery.js";

/** @typedef {import("@solos/core").AnyToolDefinition} Tool */
/** @typedef {import("@solos/core").CatalogueTier} Tier */
/** @typedef {{ readonly ceiling: Tier; readonly discovery: boolean }} Availability */

const HEADER = [
  "solOS: a thin Solana execution layer. Mainnet by default; the RPC URL is the only network switch.",
  "Tools are named solana_<group>_<verb>_<object>. Tiers: read (no side effects), simulate (builds and simulates, never sends), execute (signs and sends real transactions).",
  "Every execute tool has a simulate twin. Amounts in SOL are decimals; lamports and token amounts are decimal strings.",
];

/**
 * How the tools reach the Caller: withheld until searched for, or all up front; and what the
 * tier ceiling keeps out of reach.
 * @param {Availability} options
 */
const availability = ({ ceiling, discovery }) => [
  discovery
    ? `Most tools are withheld until asked for. Call ${SEARCH_TOOL} with a query in your own words, one group, or exact names; the matching tools then join the tool list with their full schema (tools/list_changed). Always available: ${BOOTSTRAP_TOOLS.join(", ")}.`
    : "Every tool the tier ceiling permits is advertised up front.",
  ...(ceiling === "execute"
    ? []
    : [
        `Tier ceiling: ${ceiling}. Tools above it exist and are marked unavailable below; the Operator raises the ceiling with --tier.`,
      ]),
];

/** @param {Tool} tool @param {Tier} ceiling */
const row = (tool, ceiling) =>
  `  - ${tool.name} — ${tool.title}${isWithinCeiling(tool.tier, ceiling) ? "" : ` (unavailable: above the ${ceiling} ceiling)`}`;

/**
 * Every tool's name and one-line summary, by group: names are cheap, schemas are what cost, so
 * a Caller can see the whole surface here and ask precisely (ADR-0029).
 * @param {ReadonlyArray<Tool>} tools
 * @param {Tier} ceiling
 */
const catalogue = (tools, ceiling) => {
  /** @type {Map<string, Tool[]>} */
  const byGroup = new Map();
  for (const tool of tools) {
    const members = byGroup.get(tool.group) ?? [];
    members.push(tool);
    byGroup.set(tool.group, members);
  }
  return [...byGroup]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .flatMap(([group, members]) => [`- ${group}:`, ...members.map((tool) => row(tool, ceiling))]);
};

/**
 * Server `instructions` are loaded by clients on first search or call (Claude Code) and shown
 * to the model. Header, then how tools become available, then the compact catalogue.
 * @param {ReadonlyArray<Tool>} tools every tool, all tiers
 * @param {Partial<Availability>} [options] the harness passes none: every tool, up front
 */
export const buildInstructions = (tools, { ceiling = "execute", discovery = false } = {}) =>
  [
    ...HEADER,
    ...availability({ ceiling, discovery }),
    "Catalogue (name — what it does):",
    ...catalogue(tools, ceiling),
  ].join("\n");
