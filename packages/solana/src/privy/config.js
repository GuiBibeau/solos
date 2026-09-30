// @ts-check
import { isAllowedEndpoint } from "../env-url.js";
/**
 * Privy's own "Agent Wallets" app id, the same default the official `@privy-io/agent-wallet-cli`
 * ships with. Users log in to that app in a browser; no app secret exists on this side.
 * Set PRIVY_APP_ID to use a solOS-registered app instead (needs "CLI and agent access" enabled
 * and a hosted verification page).
 */
export const DEFAULT_PRIVY_APP_ID = "cmnetjpl300rr0dkz5cqazqw0";

/**
 * https, or plain http on loopback for fixtures, like every other configured endpoint; a device
 * login and every later wallet RPC go to this host, so a substituted one drives the wallet.
 * @param {string | undefined} raw @param {string} defaultUrl @param {string} envName
 */
const endpoint = (raw, defaultUrl, envName) => {
  const url = raw ?? defaultUrl;
  if (!isAllowedEndpoint(url)) {
    throw new Error(`${envName} must use https (plain http only for loopback test fixtures)`);
  }
  return url.replace(/\/$/, "");
};

/** @param {Record<string, string | undefined>} env */
export const privyConfig = (env) => ({
  appId: env.PRIVY_APP_ID ?? DEFAULT_PRIVY_APP_ID,
  authBaseUrl: endpoint(env.PRIVY_API_BASE_URL, "https://auth.privy.io", "PRIVY_API_BASE_URL"),
  agentUrl: endpoint(env.PRIVY_AGENT_URL, "https://agents.privy.io", "PRIVY_AGENT_URL"),
});

/** @typedef {ReturnType<typeof privyConfig>} PrivyConfig */
