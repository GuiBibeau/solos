// @ts-check
import { z } from "zod";
import { selectProfile, sourceFromProfile } from "./credentials/resolve.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

const EnvSchema = z.object({
  SOLANA_RPC_URL: z.string().url("SOLANA_RPC_URL must be a URL").optional(),
  SOLANA_WS_URL: z.string().url().optional(),
  SOLOS_SIGNER_PRIVATE_KEY: z.string().min(1).optional(),
  SOLOS_SIGNER_KEYPAIR_PATH: z.string().min(1).optional(),
  SOLOS_PROFILE: z.string().min(1).optional(),
  // `direct` signs with the configured signer. `engine` is reserved for the vault-engine executor.
  SOLOS_EXECUTOR: z.enum(["direct"]).default("direct"),
  // Market intelligence (Elfa): the key is optional until a tool that bills credits is used.
  ELFA_API_KEY: z.string().min(1).optional(),
  ELFA_BASE_URL: z.string().url().optional(),
});

/** Elfa production endpoint; the only provider today, so the default lives beside its parsing. */
export const DEFAULT_ELFA_BASE_URL = "https://api.elfa.ai";

/**
 * @typedef {import("./credentials/resolve.js").SignerSource} SignerSource
 * @typedef {{
 *   readonly rpcUrl: string;
 *   readonly wsUrl: string;
 *   readonly signer: SignerSource;
 *   readonly executor: "direct";
 *   readonly profile: string | undefined;
 *   readonly elfa: { readonly apiKey: string | undefined; readonly baseUrl: string };
 * }} SolanaEnv
 */

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
 * Elfa API base URL. HTTPS everywhere except plain HTTP on loopback hosts, which exists for
 * local test fixtures only.
 * @param {string | undefined} raw
 */
export const elfaBaseUrl = (raw) => {
  const url = new URL(raw ?? DEFAULT_ELFA_BASE_URL);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error("ELFA_BASE_URL must use https (plain http only for loopback test fixtures)");
  }
  return url.href.replace(/\/$/, "");
};

/**
 * Signer from explicit env vars, when present. Exactly one of the two may be set.
 * @param {z.infer<typeof EnvSchema>} parsed
 * @returns {SignerSource | undefined}
 */
const signerFromEnv = (parsed) => {
  const { SOLOS_SIGNER_PRIVATE_KEY: key, SOLOS_SIGNER_KEYPAIR_PATH: file } = parsed;
  if (key && file)
    throw new Error("set only one of SOLOS_SIGNER_PRIVATE_KEY or SOLOS_SIGNER_KEYPAIR_PATH");
  if (key) return { kind: "privateKey", value: key };
  if (file) return { kind: "keypairPath", path: file };
  return undefined;
};

/**
 * @param {z.infer<typeof EnvSchema>} parsed
 * @param {Record<string, string | undefined>} env
 */
const resolveSigner = (parsed, env) => {
  const fromEnv = signerFromEnv(parsed);
  if (fromEnv) return { signer: fromEnv, selected: undefined };
  const selected = selectProfile(env);
  if (selected === undefined) {
    throw new Error(
      "no signer: set SOLOS_SIGNER_KEYPAIR_PATH / SOLOS_SIGNER_PRIVATE_KEY, or run `solos login`",
    );
  }
  return { signer: sourceFromProfile(selected.profile, env, selected.name), selected };
};

/**
 * Validate and shape the Solana-related environment. Precedence, per ADR-0015:
 * explicit env vars, then the profile named by SOLOS_PROFILE, then the default profile.
 * There is never a default RPC URL.
 * @param {Record<string, string | undefined>} env
 * @returns {SolanaEnv}
 */
export const loadSolanaEnv = (env) => {
  const parsed = EnvSchema.parse(env);
  const { signer, selected } = resolveSigner(parsed, env);
  const rpcUrl = parsed.SOLANA_RPC_URL ?? selected?.profile.rpcUrl;
  if (rpcUrl === undefined) {
    throw new Error(
      "SOLANA_RPC_URL is not set and the profile has no rpcUrl; there is no default RPC",
    );
  }
  return {
    rpcUrl,
    wsUrl: parsed.SOLANA_WS_URL ?? deriveWsUrl(rpcUrl),
    signer,
    executor: parsed.SOLOS_EXECUTOR,
    profile: selected?.name,
    elfa: { apiKey: parsed.ELFA_API_KEY, baseUrl: elfaBaseUrl(parsed.ELFA_BASE_URL) },
  };
};
