// @ts-check
/**
 * Privy's own "Agent Wallets" app id, the same default the official `@privy-io/agent-wallet-cli`
 * ships with. Users log in to that app in a browser; no app secret exists on this side.
 * Set PRIVY_APP_ID to use a solOS-registered app instead (needs "CLI and agent access" enabled
 * and a hosted verification page).
 */
export const DEFAULT_PRIVY_APP_ID = "cmnetjpl300rr0dkz5cqazqw0";

/** @param {Record<string, string | undefined>} env */
export const privyConfig = (env) => ({
  appId: env.PRIVY_APP_ID ?? DEFAULT_PRIVY_APP_ID,
  authBaseUrl: (env.PRIVY_API_BASE_URL ?? "https://auth.privy.io").replace(/\/$/, ""),
  agentUrl: (env.PRIVY_AGENT_URL ?? "https://agents.privy.io").replace(/\/$/, ""),
});

/** @typedef {ReturnType<typeof privyConfig>} PrivyConfig */
