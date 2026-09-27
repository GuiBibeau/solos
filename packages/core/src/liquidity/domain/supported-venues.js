// @ts-check
/**
 * The "which venues does this support" sentence, generated from the protocol lists in `types.js`
 * so a tool description cannot contradict them. Every liquidity tool carries it, and the
 * reference page renders it as a generated region from the same string.
 */
import {
  DEPOSIT_PROTOCOLS,
  ENUMERATION_PROTOCOLS,
  LIFECYCLE_PROTOCOLS,
  POSITION_READ_PROTOCOLS,
  READ_PROTOCOLS,
} from "./types.js";

/** Join a protocol list as "a, b and c". @param {ReadonlyArray<string>} protocols */
const asList = (protocols) =>
  protocols.length <= 1
    ? (protocols[0] ?? "")
    : `${protocols.slice(0, -1).join(", ")} and ${protocols.at(-1)}`;

/** Meteora's open is empty-only, so its name alone would overstate what the operation supports. */
/** @type {Record<string, string>} */
const OPEN_CAVEAT = { meteora: "an empty meteora position" };

/** @param {string} protocol */
const openCaveat = (protocol) => OPEN_CAVEAT[protocol] ?? protocol;

/**
 * The supported-venue sentence. A per-venue caveat applies to the lifecycle clause, because
 * "raydium and meteora" would overstate what open supports.
 */
export const SUPPORTED_VENUES =
  `Supported venues: point reads ${asList(POSITION_READ_PROTOCOLS)}, deposits ${asList(DEPOSIT_PROTOCOLS)}, ` +
  `withdrawals ${asList(READ_PROTOCOLS)}, owner enumeration ${asList(ENUMERATION_PROTOCOLS)}; ` +
  `opens and closes ${asList(LIFECYCLE_PROTOCOLS.map(openCaveat))}.`;
