// @ts-check
import { resolveSecretRef } from "./secret-ref.js";
import { readCredentials, saveProfile } from "./store.js";

/**
 * Where a signer comes from. `privateKey`/`keypairPath` are the env-only sources; the others are
 * produced from profiles. Secrets are already resolved here.
 * @typedef {import("../privy/session.js").PrivySession} PrivySession
 * @typedef {{ readonly kind: "privateKey"; readonly value: string }
 *   | { readonly kind: "keypairPath"; readonly path: string }
 *   | { readonly kind: "pay"; readonly account: string }
 *   | { readonly kind: "privy"; readonly appId: string; readonly walletId: string; readonly walletAddress: string; readonly session: PrivySession; readonly persist: (session: PrivySession) => void }
 *   | { readonly kind: "privy-server"; readonly appId: string; readonly appSecret: string; readonly walletId: string; readonly authorizationPrivateKey?: string }} SignerSource
 */

/** @typedef {import("./profile.js").Profile} Profile */

/**
 * @param {Extract<Profile, { provider: "local" }>} profile
 * @param {Record<string, string | undefined>} env
 * @returns {SignerSource}
 */
const localSource = (profile, env) => {
  if (profile.keypairPath) return { kind: "keypairPath", path: profile.keypairPath };
  if (profile.privateKey) {
    return { kind: "privateKey", value: resolveSecretRef(profile.privateKey, env) };
  }
  throw new Error("local profile needs keypairPath or privateKey");
};

/**
 * The user's Privy wallet. `persist` writes refreshed sessions back to this profile.
 * @param {Extract<Profile, { provider: "privy" }>} profile
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @returns {SignerSource}
 */
const privyUserSource = (profile, env, name) => ({
  kind: "privy",
  appId: profile.appId,
  walletId: profile.walletId,
  walletAddress: profile.wallet.address,
  session: profile.session,
  persist: (session) => void saveProfile(env, { name, profile: { ...profile, session } }),
});

/**
 * @param {Extract<Profile, { provider: "privy-server" }>} profile
 * @param {Record<string, string | undefined>} env
 * @returns {SignerSource}
 */
const privyServerSource = (profile, env) => ({
  kind: "privy-server",
  appId: profile.appId,
  appSecret: resolveSecretRef(profile.appSecret, env),
  walletId: profile.walletId,
  ...(profile.authorizationPrivateKey && {
    authorizationPrivateKey: resolveSecretRef(profile.authorizationPrivateKey, env),
  }),
});

/**
 * @param {Profile} profile
 * @param {Record<string, string | undefined>} env
 * @param {string} [name] profile name, needed to persist refreshed sessions
 * @returns {SignerSource}
 */
export const sourceFromProfile = (profile, env, name = "default") => {
  switch (profile.provider) {
    case "local": {
      return localSource(profile, env);
    }
    case "pay": {
      return { kind: "pay", account: profile.account };
    }
    case "privy": {
      return privyUserSource(profile, env, name);
    }
    case "privy-server": {
      return privyServerSource(profile, env);
    }
    default: {
      throw new Error("unknown provider");
    }
  }
};

/**
 * Pick the profile named by `SOLOS_PROFILE`, else the file's default. Undefined when none.
 * @param {Record<string, string | undefined>} env
 * @returns {{ name: string; profile: Profile } | undefined}
 */
export const selectProfile = (env) => {
  const credentials = readCredentials(env);
  const name = env.SOLOS_PROFILE ?? credentials.default;
  if (name === undefined) return undefined;
  const profile = credentials.profiles[name];
  if (profile === undefined) {
    throw new Error(`profile "${name}" not found; run \`solos login\` or check SOLOS_PROFILE`);
  }
  return { name, profile };
};
