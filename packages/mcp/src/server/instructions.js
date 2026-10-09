// @ts-check
import { isWithinCeiling } from "@solos/core";
import { BOOTSTRAP_TOOLS, SEARCH_TOOL } from "./discovery.js";

/** @typedef {import("@solos/core").AnyToolDefinition} Tool */
/** @typedef {import("@solos/core").CatalogueTier} Tier */
/** @typedef {{ readonly ceiling: Tier; readonly discovery: boolean; readonly experimental: boolean }} Availability */

const EXPERIMENTAL_LINE =
  "Experimental tools are withheld here and marked unavailable below; the Operator enables them with --features experimental.";

const HEADER = [
  "solOS: a thin Solana execution layer. Mainnet by default; the RPC URL is the only network switch.",
  "Tools are named solana_<group>_<verb>_<object>. Tiers: read (no side effects), simulate (builds and simulates, never sends), execute (signs and sends real transactions).",
  "Every execute tool has a simulate twin. Amounts in SOL are decimals; lamports and token amounts are decimal strings.",
];

/**
 * How the tools reach the Caller: withheld until searched for, or all up front; what the tier
 * ceiling keeps out of reach; and whether experimental tools are withheld (ADR-0036).
 * @param {Availability} options @param {ReadonlyArray<Tool>} tools
 */
const availability = ({ ceiling, discovery, experimental }, tools) => {
  const withholdsExperimental =
    !experimental && tools.some((tool) => tool.stability === "experimental");
  return [
    discovery
      ? `Most tools are withheld until asked for. Call ${SEARCH_TOOL} with a query in your own words, one group, or exact names; the matching tools then join the tool list with their full schema (tools/list_changed). Always available: ${BOOTSTRAP_TOOLS.join(", ")}.`
      : `Every tool the tier ceiling permits${withholdsExperimental ? ", except the experimental ones," : ""} is advertised up front.`,
    ...(ceiling === "execute"
      ? []
      : [
          `Tier ceiling: ${ceiling}. Tools above it exist and are marked unavailable below; the Operator raises the ceiling with --tier.`,
        ]),
    ...(withholdsExperimental ? [EXPERIMENTAL_LINE] : []),
  ];
};

/**
 * Why a listed tool cannot be called here, or nothing. A tool both above the ceiling and
 * experimental names both gates, since lifting one would not make it callable.
 * @param {Tool} tool @param {Availability} options
 */
const withheld = (tool, { ceiling, experimental }) => {
  const reasons = [
    ...(isWithinCeiling(tool.tier, ceiling) ? [] : [`above the ${ceiling} ceiling`]),
    ...(!experimental && tool.stability === "experimental"
      ? ["experimental; the Operator enables it with --features experimental"]
      : []),
  ];
  return reasons.length === 0 ? "" : ` (unavailable: ${reasons.join("; ")})`;
};

/** @param {Tool} tool @param {Availability} options */
const row = (tool, options) => `  - ${tool.name} — ${tool.title}${withheld(tool, options)}`;

/**
 * Every tool's name and one-line summary, by group: names are cheap, schemas are what cost, so
 * a Caller can see the whole surface here and ask precisely (ADR-0029).
 * @param {ReadonlyArray<Tool>} tools
 * @param {Availability} options
 */
const catalogue = (tools, options) => {
  /** @type {Map<string, Tool[]>} */
  const byGroup = new Map();
  for (const tool of tools) {
    const members = byGroup.get(tool.group) ?? [];
    members.push(tool);
    byGroup.set(tool.group, members);
  }
  return [...byGroup]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .flatMap(([group, members]) => [`- ${group}:`, ...members.map((tool) => row(tool, options))]);
};

/**
 * Server `instructions` are loaded by clients on first search or call (Claude Code) and shown
 * to the model. Header, then how tools become available, then the compact catalogue.
 * @param {ReadonlyArray<Tool>} tools every tool, all tiers
 * @param {Partial<Availability>} [options] the harness passes none: every tool, up front
 */
export const buildInstructions = (
  tools,
  { ceiling = "execute", discovery = false, experimental = true } = {},
) => {
  const options = { ceiling, discovery, experimental };
  return [
    ...HEADER,
    ...availability(options, tools),
    "Catalogue (name — what it does):",
    ...catalogue(tools, options),
  ].join("\n");
};
