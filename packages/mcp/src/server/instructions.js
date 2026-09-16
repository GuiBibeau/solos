// @ts-check
/**
 * Server `instructions` are loaded by clients on first search or call (Claude Code) and shown
 * to the model. Keep it a short capability map, one line per group.
 * @param {ReadonlyArray<import("@solos/core").AnyToolDefinition>} tools
 */
export const buildInstructions = (tools) => {
  /** @type {Map<string, string[]>} */
  const byGroup = new Map();
  for (const tool of tools) {
    const names = byGroup.get(tool.group) ?? [];
    names.push(tool.name);
    byGroup.set(tool.group, names);
  }
  const lines = [...byGroup]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([group, names]) => `- ${group}: ${names.join(", ")}`);
  return [
    "solOS: a thin Solana execution layer. Mainnet by default; the RPC URL is the only network switch.",
    "Tools are named solana_<group>_<verb>_<object>. Tiers: read (no side effects), simulate (builds and simulates, never sends), execute (signs and sends real transactions).",
    "Every execute tool has a simulate twin. Amounts in SOL are decimals; lamports and token amounts are decimal strings.",
    "Groups:",
    ...lines,
  ].join("\n");
};
