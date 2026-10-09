// @ts-check
/**
 * The catalogue as pure data: which tiers a ceiling admits, and the summaries a registry of tool
 * definitions reduces to. Nothing here knows about MCP registration.
 */

/** @type {Record<import("./types.js").CatalogueTier, number>} */
const TIER_RANK = { read: 0, simulate: 1, execute: 2 };

/**
 * @param {import("./types.js").CatalogueTier} tier
 * @param {import("./types.js").CatalogueTier} ceiling
 */
export const isWithinCeiling = (tier, ceiling) => TIER_RANK[tier] <= TIER_RANK[ceiling];

/**
 * The highest of the given tiers: what an Operator would raise the ceiling to.
 * @param {ReadonlyArray<import("./types.js").CatalogueTier>} tiers non-empty
 */
export const highestTier = (tiers) =>
  tiers.reduce((top, tier) => (TIER_RANK[tier] > TIER_RANK[top] ? tier : top));

/**
 * Whether this server lets a Caller call the tool: within the tier ceiling, and not an
 * experimental tool on a server that has not enabled them (ADR-0036).
 * @param {{ tier: import("./types.js").CatalogueTier; stability: import("./types.js").Stability }} tool
 * @param {{ ceiling: import("./types.js").CatalogueTier; experimental: boolean }} catalogue
 */
export const isExposed = (tool, catalogue) =>
  (tool.stability !== "experimental" || catalogue.experimental) &&
  isWithinCeiling(tool.tier, catalogue.ceiling);

/** Experimental tools are withheld unless the Operator enables them. */
const DEFAULT_FEATURES = Object.freeze({ experimental: false });

/** @typedef {{ name: string; group: string; title: string; description: string; tier: import("./types.js").CatalogueTier; stability: import("./types.js").Stability }} Definition */

/**
 * Reduce tool definitions to catalogue rows: the selector's four fields, the tier and the
 * label, under the ceiling and the feature flags this server runs with.
 * @param {ReadonlyArray<Definition>} definitions
 * @param {import("./types.js").CatalogueTier} ceiling
 * @param {{ experimental: boolean }} [features] experimental tools are withheld unless enabled
 * @returns {import("../ports/tool-catalogue.js").ToolCatalogueShape}
 */
export const catalogueOf = (definitions, ceiling, features = DEFAULT_FEATURES) => ({
  ceiling,
  experimental: features.experimental,
  tools: definitions.map(({ name, group, title, description, tier, stability }) => ({
    name,
    group,
    title,
    description,
    tier,
    stability,
  })),
});
