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
 * Reduce tool definitions to catalogue rows: the selector's four fields and the tier.
 * @param {ReadonlyArray<{ name: string; group: string; title: string; description: string; tier: import("./types.js").CatalogueTier }>} definitions
 * @param {import("./types.js").CatalogueTier} ceiling
 * @returns {import("../ports/tool-catalogue.js").ToolCatalogueShape}
 */
export const catalogueOf = (definitions, ceiling) => ({
  ceiling,
  tools: definitions.map(({ name, group, title, description, tier }) => ({
    name,
    group,
    title,
    description,
    tier,
  })),
});
