// @ts-check
/**
 * Just-in-time discovery (ADR-0029). Every tool within the tier ceiling is registered, most are
 * withheld, and the search tool enables its matches. Enabling goes through the SDK, which fires
 * `tools/list_changed`, so a discovered tool arrives with its real schema and annotations rather
 * than as text a Caller would have to trust.
 */

/** @typedef {import("@modelcontextprotocol/server").RegisteredTool} RegisteredTool */

export const SEARCH_TOOL = "solana_discovery_search_tools";

/**
 * Advertised from the first `tools/list`: the entry point, and the "where am I" reads a Caller
 * asks first, which should not cost a discovery round-trip.
 */
export const BOOTSTRAP_TOOLS = Object.freeze([
  SEARCH_TOOL,
  "solana_portfolio_get_state",
  "solana_wallet_get_balance",
]);

/** @param {ReadonlyMap<string, RegisteredTool>} registered */
export const withholdAllButBootstrap = (registered) => {
  for (const [name, tool] of registered) {
    if (!BOOTSTRAP_TOOLS.includes(name)) tool.disable();
  }
};

/**
 * Enable the matches a search reported available. Matches above the ceiling were never
 * registered and stay unavailable; unknown names never reach here.
 * @param {ReadonlyMap<string, RegisteredTool>} registered
 * @param {unknown} output the search tool's structured result
 * @returns {string[]} the names this call enabled, in result order
 */
export const revealMatches = (registered, output) => {
  const { matches = [] } =
    /** @type {{ matches?: Array<{ name: string; available: boolean }> }} */ (output ?? {});
  /** @type {string[]} */
  const enabled = [];
  for (const match of matches) {
    const tool = registered.get(match.name);
    if (tool !== undefined && match.available && !tool.enabled) {
      tool.enable();
      enabled.push(match.name);
    }
  }
  return enabled;
};
