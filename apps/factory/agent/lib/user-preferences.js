// @ts-check
/**
 * Key derivation for per-user preference files under the reserved `user-preferences/` prefix.
 */
import { createHash } from "node:crypto";
import { USER_PREFERENCES_PREFIX } from "./blob.js";

/**
 * Structural subset of eve's `SessionAuthContext`, kept narrow on purpose.
 * @typedef {{ readonly principalId: string; readonly principalType: string } | null | undefined} UserPrincipal
 */

/**
 * The Blob key holding the current user's preferences. Derived entirely from the
 * framework-resolved principal, never from model input, so a session can only read or write its
 * own user's file. Only `principalType: "user"` principals get a key; app, service, and runtime
 * callers get `null` so the tools decline instead of sharing one anonymous file.
 * @param {UserPrincipal} principal `ctx.session.auth.current`
 * @returns {string | null}
 */
export const userPreferencesKey = (principal) => {
  if (principal?.principalType !== "user" || principal.principalId === "") return null;
  const id = createHash("sha256").update(principal.principalId).digest("hex");
  return `${USER_PREFERENCES_PREFIX}${id}.md`;
};
