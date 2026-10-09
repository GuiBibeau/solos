// @ts-check
/**
 * What a running solos says about its release (ADR-0036): the version the build defined, the
 * lane that version implies, and the commit it was built from. `solos doctor` prints it; the
 * build's smoke test asserts it.
 */
import { SOLOS_COMMIT, SOLOS_VERSION } from "@solos/mcp";
import { laneOf } from "./version.js";

/** @typedef {{ version: string; lane: import("./version.js").Lane; commit: string | null }} ReleaseIdentity */

/**
 * @param {string} version @param {string | null} commit
 * @returns {ReleaseIdentity}
 */
export const identityOf = (version, commit) => ({ version, lane: laneOf(version), commit });

/** The identity of this very process. */
export const releaseIdentity = () => identityOf(SOLOS_VERSION, SOLOS_COMMIT);
