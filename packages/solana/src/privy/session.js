// @ts-check
import { z } from "zod";

/**
 * What a Privy login leaves behind. The refresh token is the durable credential (30 days,
 * rotated on use); the rest is re-derived from it. All of it is secret; it lives in the
 * credentials file (0600) and nowhere else.
 */
export const PrivySessionSchema = z.object({
  refreshToken: z.string().min(1),
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.number().int().describe("Unix ms"),
  authorizationKey: z.string().min(1),
  authorizationKeyExpiresAt: z.number().int().describe("Unix ms"),
});

/** @typedef {z.infer<typeof PrivySessionSchema>} PrivySession */

/** Refresh a little early so an in-flight request never straddles expiry. */
const SKEW_MS = 60_000;

/** @param {PrivySession} session @param {number} now */
export const isSessionFresh = (session, now = Date.now()) =>
  session.accessTokenExpiresAt - SKEW_MS > now && session.authorizationKeyExpiresAt - SKEW_MS > now;

/**
 * Tokens plus a fresh authorization key, from a token response.
 * @param {import("./api.js").PrivyApi} api
 * @param {import("./api.js").TokenResponse} tokens
 * @param {number} now
 * @returns {Promise<{ session: PrivySession; wallets: import("./api.js").PrivyWallet[] }>}
 */
export const sessionFromTokens = async (api, tokens, now = Date.now()) => {
  const auth = await api.authenticateWallets(tokens.access_token);
  const authorizationKeyExpiresAt = Date.parse(auth.expiresAt);
  // A missing or malformed expiry would become NaN and silently defeat every freshness check.
  if (!Number.isFinite(tokens.expires_in) || !Number.isFinite(authorizationKeyExpiresAt)) {
    throw new TypeError("Privy returned a token response without a usable expiry");
  }
  return {
    session: {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: now + tokens.expires_in * 1000,
      authorizationKey: auth.authorizationKey,
      authorizationKeyExpiresAt,
    },
    wallets: auth.wallets,
  };
};

/**
 * Refresh when needed and hand the new session to `persist` so the credentials file follows.
 * @param {{
 *   api: import("./api.js").PrivyApi;
 *   session: PrivySession;
 *   persist: (session: PrivySession) => void | Promise<void>;
 *   force?: boolean;
 * }} input
 */
export const ensureFreshSession = async ({ api, session, persist, force = false }) => {
  if (!force && isSessionFresh(session)) return session;
  const tokens = await api.refreshToken(session.refreshToken);
  const { session: next } = await sessionFromTokens(api, tokens);
  await persist(next);
  return next;
};
