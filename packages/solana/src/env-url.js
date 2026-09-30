// @ts-check

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

/** Elfa production endpoint; the only provider today, so the default lives beside its parsing. */
export const DEFAULT_ELFA_BASE_URL = "https://api.elfa.ai";

/** Jupiter production endpoint; lite-api hosts are deprecated and never a default. */
export const DEFAULT_JUPITER_BASE_URL = "https://api.jup.ag";

/** Phoenix Perps production endpoint; reads are public and need no credential. */
export const DEFAULT_PHOENIX_BASE_URL = "https://perp-api.phoenix.trade";

/** Vercel AI Gateway, where JEV is served as `typesafe-ai/jev`; the client's own default. */
export const DEFAULT_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v4/ai";

/**
 * Local validators (Surfpool, test-validator) put WebSocket on RPC port + 1; providers share the host.
 * @param {string} rpcUrl
 */
export const deriveWsUrl = (rpcUrl) => {
  const url = new URL(rpcUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (LOCAL_HOSTS.has(url.hostname) && url.port !== "") {
    url.port = String(Number(url.port) + 1);
  }
  return url.href.replace(/\/$/, "");
};

/**
 * The scheme rule every configured endpoint follows: https, or plain http on a loopback host
 * for local fixtures and Surfpool. A remote http endpoint would carry any embedded credential
 * in clear.
 * @param {string} raw
 */
export const isAllowedEndpoint = (raw) => {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
};

/**
 * Provider API base URL. HTTPS everywhere except plain HTTP on loopback hosts, which exists for
 * local test fixtures only.
 * @param {string | undefined} raw
 * @param {string} defaultUrl
 * @param {string} envName
 */
const providerBaseUrl = (raw, defaultUrl, envName) => {
  const url = new URL(raw ?? defaultUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error(`${envName} must use https (plain http only for loopback test fixtures)`);
  }
  return url.href.replace(/\/$/, "");
};

/**
 * Elfa API base URL.
 * @param {string | undefined} raw
 */
export const elfaBaseUrl = (raw) => providerBaseUrl(raw, DEFAULT_ELFA_BASE_URL, "ELFA_BASE_URL");

/**
 * Jupiter API base URL.
 * @param {string | undefined} raw
 */
export const jupiterBaseUrl = (raw) =>
  providerBaseUrl(raw, DEFAULT_JUPITER_BASE_URL, "JUPITER_BASE_URL");

/**
 * Phoenix Perps API base URL.
 * @param {string | undefined} raw
 */
export const phoenixBaseUrl = (raw) =>
  providerBaseUrl(raw, DEFAULT_PHOENIX_BASE_URL, "PHOENIX_BASE_URL");

/**
 * Vercel AI Gateway base URL.
 * @param {string | undefined} raw
 */
export const aiGatewayBaseUrl = (raw) =>
  providerBaseUrl(raw, DEFAULT_AI_GATEWAY_BASE_URL, "AI_GATEWAY_BASE_URL");
