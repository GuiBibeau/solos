// @ts-check
/**
 * The tier ceiling for a surface that runs tools (ADR-0029, ADR-0033): the highest tier a model
 * may call. The MCP server has had one since ADR-0029; the agent loop applies the same rule here.
 */
import { z } from "zod";

export const TierSchema = z.enum(["read", "simulate", "execute"]);
/** @typedef {z.infer<typeof TierSchema>} Tier */

export const INVALID_TIER = "SOLOS_TOOL_TIER must be read, simulate or execute";

/**
 * The flag wins. Without it, an absent or blank `SOLOS_TOOL_TIER` means the default, `simulate`,
 * and a value that is not a tier fails: widening a mistyped `read` to `simulate` would hand the
 * model tools the Operator meant to withhold.
 * @param {string | undefined} flag
 * @param {Record<string, string | undefined>} env
 * @returns {Tier}
 */
export const tierCeiling = (flag, env) => {
  if (flag !== undefined) return TierSchema.parse(flag);
  const raw = env.SOLOS_TOOL_TIER;
  if (raw === undefined || raw.trim() === "") return "simulate";
  const parsed = TierSchema.safeParse(raw.trim());
  if (!parsed.success) throw new Error(INVALID_TIER);
  return parsed.data;
};

/**
 * A third-party MCP tool carries no tier this loop can trust, so it is admitted only when the
 * ceiling already admits everything. Below `execute` the configured servers are not even started.
 * @param {Tier} ceiling
 */
export const canAdmitExternalTools = (ceiling) => ceiling === "execute";
