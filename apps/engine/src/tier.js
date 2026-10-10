// @ts-check
import { TierWithheld } from "@solos/core";

/** @typedef {import("./config.js").Tier} Tier */

const RANK = /** @type {Record<Tier, number>} */ ({ read: 0, simulate: 1, execute: 2 });

/**
 * Undefined when the ceiling allows the request. Otherwise the refusal names the ceiling and
 * the flag that raises it.
 * @param {Tier} ceiling
 * @param {Tier} needed
 */
export const tierRefusal = (ceiling, needed) => {
  if (RANK[needed] <= RANK[ceiling]) return undefined;
  return new TierWithheld({
    tier: ceiling,
    reason: `the engine is running at the ${ceiling} tier, which withholds ${needed}`,
    remedy: remedyFor(needed),
  });
};

/** @param {Tier} needed */
const remedyFor = (needed) =>
  needed === "execute"
    ? "restart the engine with --tier execute"
    : `restart the engine with --tier ${needed}`;
