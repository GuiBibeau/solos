// @ts-check
/**
 * Inbound route auth for the eve route: `[localDevUser, vercelOidc()]` rejects public browser
 * traffic; channel traffic is authenticated by each connector.
 */
import { localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

/** @typedef {import("eve/channels/auth").AuthFn<Request>} AuthFn */

const localDevAuth = localDev();

/**
 * Dev-only: present a trusted local session as an authenticated user. The user-preference tools
 * key their storage on a `principalType: "user"` session; the dev TUI's `local-dev` principal is
 * not one. This shim defers the trust decision to `localDev()`, returning `null` for anything it
 * would reject so it never affects production, and only upgrades the resolved principal to a user.
 * @type {AuthFn}
 */
const localDevUser = async (request) => {
  const local = await localDevAuth(request);
  return local ? { ...local, principalType: "user" } : null;
};

export default eveChannel({ auth: [localDevUser, vercelOidc()] });
