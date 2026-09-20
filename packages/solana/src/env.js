// @ts-check
import { base58ByteLength } from "@solos/core/shared";
import { z } from "zod";
import { selectProfile, sourceFromProfile } from "./credentials/resolve.js";
import { deriveWsUrl, elfaBaseUrl, jupiterBaseUrl, phoenixBaseUrl } from "./env-url.js";
import { KAMINO_MAIN_MARKET } from "./lend/kamino-addresses.js";

export {
  DEFAULT_ELFA_BASE_URL,
  DEFAULT_JUPITER_BASE_URL,
  DEFAULT_PHOENIX_BASE_URL,
  deriveWsUrl,
  elfaBaseUrl,
  jupiterBaseUrl,
  phoenixBaseUrl,
} from "./env-url.js";

const EnvSchema = z.object({
  SOLANA_RPC_URL: z.string().url("SOLANA_RPC_URL must be a URL").optional(),
  SOLANA_WS_URL: z.string().url().optional(),
  SOLOS_SIGNER_PRIVATE_KEY: z.string().min(1).optional(),
  SOLOS_SIGNER_KEYPAIR_PATH: z.string().min(1).optional(),
  SOLOS_PROFILE: z.string().min(1).optional(),
  // `direct` signs with the configured signer. `engine` is reserved for the vault-engine executor.
  SOLOS_EXECUTOR: z.enum(["direct"]).default("direct"),
  // Market intelligence (Elfa): the key is optional until a tool that bills credits is used.
  ELFA_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  ELFA_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  // Jupiter prices: the key is optional at startup and required only when a price is read.
  JUPITER_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  JUPITER_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  // Phoenix Perps reads are public; only the endpoint is configurable (loopback fixtures).
  PHOENIX_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  // Kamino lend reads are public; only the configured market is selectable (ADR-0019).
  KAMINO_LENDING_MARKET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .refine(
        (value) => base58ByteLength(value) === 32,
        "KAMINO_LENDING_MARKET must be a base58 address that decodes to 32 bytes",
      )
      .optional(),
  ),
});

/**
 * @typedef {import("./credentials/resolve.js").SignerSource} SignerSource
 * @typedef {{
 *   readonly rpcUrl: string;
 *   readonly wsUrl: string;
 *   readonly signer: SignerSource;
 *   readonly executor: "direct";
 *   readonly profile: string | undefined;
 *   readonly elfa: { readonly apiKey: string | undefined; readonly baseUrl: string };
 *   readonly jupiter: { readonly apiKey: string | undefined; readonly baseUrl: string };
 *   readonly phoenix: { readonly baseUrl: string };
 *   readonly kamino: { readonly market: string };
 * }} SolanaEnv
 */

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
    jupiter: { apiKey: parsed.JUPITER_API_KEY, baseUrl: jupiterBaseUrl(parsed.JUPITER_BASE_URL) },
    phoenix: { baseUrl: phoenixBaseUrl(parsed.PHOENIX_BASE_URL) },
    kamino: { market: parsed.KAMINO_LENDING_MARKET ?? KAMINO_MAIN_MARKET },
  };
};
