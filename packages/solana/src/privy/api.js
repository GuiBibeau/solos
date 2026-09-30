// @ts-check
import {
  authorizationPayload,
  decryptAuthorizationKey,
  generateRecipientKeyPair,
  signAuthorization,
} from "./crypto.js";

/**
 * Privy's OAuth device-code endpoints for agents, exactly as the official agent CLI calls them.
 * `fetch` is injectable so the flow is testable without Privy.
 * @typedef {(input: string, init?: RequestInit) => Promise<Response>} Fetch
 * @typedef {{ device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; expires_in: number; interval: number }} DeviceAuthorization
 * @typedef {{ access_token: string; token_type: string; expires_in: number; refresh_token: string }} TokenResponse
 * @typedef {{ id: string; address: string; chain_type: string }} PrivyWallet
 * @typedef {{ authorizationKey: string; expiresAt: string; wallets: PrivyWallet[] }} WalletAuthentication
 * @typedef {import("./config.js").PrivyConfig} PrivyConfig
 */

export class PrivyApiError extends Error {
  /**
   * @param {string} step
   * @param {number} status
   * @param {string} detail
   */
  constructor(step, status, detail) {
    super(`privy ${step} failed (${status}): ${detail}`);
    this.name = "PrivyApiError";
    this.step = step;
    this.status = status;
  }
}

/**
 * @param {Response} response
 * @param {string} step
 */
const json = async (response, step) => {
  if (!response.ok) {
    throw new PrivyApiError(step, response.status, (await response.text()).slice(0, 300));
  }
  return response.json();
};

/** Every Privy call gets one deadline; a stalled provider must not hang the signing path. */
export const PRIVY_TIMEOUT_MS = 30_000;

/** @param {RequestInit} init @returns {RequestInit} */
const withDeadline = (init) => ({ ...init, signal: AbortSignal.timeout(PRIVY_TIMEOUT_MS) });

/** @param {string | undefined} error */
const pollOutcome = (error) => {
  if (error === "authorization_pending") return "pending";
  if (error === "slow_down") return "slow_down";
  const reason = {
    expired_token: "code expired, log in again",
    access_denied: "the user denied access",
  }[error ?? ""];
  throw new PrivyApiError("device_token", 400, reason ?? error ?? "unknown");
};

/** @param {PrivyConfig} config @param {Fetch} fetchImpl */
const deviceEndpoints = (config, fetchImpl) => {
  const headers = { "Content-Type": "application/json", "privy-app-id": config.appId };
  const tokenUrl = `${config.authBaseUrl}/api/oauth/v2/token`;
  /** @param {unknown} body */
  const token = (body) =>
    fetchImpl(tokenUrl, withDeadline({ method: "POST", headers, body: JSON.stringify(body) }));
  return {
    /** @returns {Promise<DeviceAuthorization>} */
    startDeviceAuthorization: () =>
      fetchImpl(
        `${config.authBaseUrl}/api/oauth/v2/device_authorization`,
        withDeadline({
          method: "POST",
          headers: { ...headers, Origin: config.agentUrl },
          body: "{}",
        }),
      ).then((r) => json(r, "device_authorization")),

    /**
     * One poll. Tokens, or `"pending"` / `"slow_down"` for the caller to schedule.
     * @param {string} deviceCode
     * @returns {Promise<TokenResponse | "pending" | "slow_down">}
     */
    pollDeviceToken: async (deviceCode) => {
      const response = await token({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
      });
      if (response.ok) return response.json();
      const body = /** @type {{ error?: string }} */ (await response.json().catch(() => ({})));
      return pollOutcome(body.error);
    },

    /** @param {string} refreshToken @returns {Promise<TokenResponse>} */
    refreshToken: (refreshToken) =>
      token({ grant_type: "refresh_token", refresh_token: refreshToken }).then((r) =>
        json(r, "refresh_token"),
      ),
  };
};

const GRANT_HEADERS = { "Content-Type": "application/json", "privy-grant-type": "device_code" };

/**
 * Exchange the access token for an ephemeral authorization key plus the user's wallets.
 * @param {PrivyConfig} config
 * @param {Fetch} fetchImpl
 * @param {string} accessToken
 * @returns {Promise<WalletAuthentication>}
 */
const authenticateWallets = async (config, fetchImpl, accessToken) => {
  const pair = await generateRecipientKeyPair();
  const response = await fetchImpl(
    `${config.authBaseUrl}/api/oauth/v2/wallets/authenticate`,
    withDeadline({
      method: "POST",
      headers: {
        ...GRANT_HEADERS,
        "privy-app-id": config.appId,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        encryption_type: "HPKE",
        recipient_public_key: pair.publicKeySpkiBase64,
      }),
    }),
  );
  const data = await json(response, "wallets/authenticate");
  return {
    authorizationKey: await decryptAuthorizationKey(
      pair.privateKey,
      data.encrypted_authorization_key,
    ),
    expiresAt: data.expires_at,
    wallets: data.wallets,
  };
};

/**
 * Signed wallet RPC. Returns the raw response so the caller can handle 401 (expired grant).
 * @param {PrivyConfig} config
 * @param {Fetch} fetchImpl
 * @param {{ walletId: string; body: unknown; accessToken: string; authorizationKey: string }} input
 */
const walletRpc = async (config, fetchImpl, { walletId, body, accessToken, authorizationKey }) => {
  const url = `${config.authBaseUrl}/api/oauth/v2/wallets/${walletId}/rpc`;
  const payload = authorizationPayload({ appId: config.appId, url, body });
  const signature = await signAuthorization(authorizationKey, payload);
  return fetchImpl(
    url,
    withDeadline({
      method: "POST",
      headers: {
        ...GRANT_HEADERS,
        "privy-app-id": config.appId,
        "privy-authorization-signature": signature,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }),
  );
};

/** @param {PrivyConfig} config @param {Fetch} [fetchImpl] */
export const privyApi = (config, fetchImpl = fetch) => ({
  ...deviceEndpoints(config, fetchImpl),
  /** @param {string} accessToken */
  authenticateWallets: (accessToken) => authenticateWallets(config, fetchImpl, accessToken),
  /** @param {{ walletId: string; body: unknown; accessToken: string; authorizationKey: string }} input */
  walletRpc: (input) => walletRpc(config, fetchImpl, input),
});

/** @typedef {ReturnType<typeof privyApi>} PrivyApi */
