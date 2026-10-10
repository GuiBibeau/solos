// @ts-check
import { RpcConfigMissing, SignerConfigMissing } from "@solos/core";
import { base58ByteLength } from "@solos/core/shared";
import { z } from "zod";
import { selectProfile, sourceFromProfile } from "./credentials/resolve.js";
import { engineCaller } from "./env-engine.js";
import {
  aiGatewayBaseUrl,
  deriveWsUrl,
  elfaBaseUrl,
  jupiterBaseUrl,
  phoenixBaseUrl,
} from "./env-url.js";
import { KAMINO_MAIN_MARKET } from "./lend/kamino-addresses.js";

export {
  DEFAULT_AI_GATEWAY_BASE_URL,
  DEFAULT_ELFA_BASE_URL,
  DEFAULT_JUPITER_BASE_URL,
  DEFAULT_PHOENIX_BASE_URL,
  deriveWsUrl,
  elfaBaseUrl,
  isAllowedEndpoint,
  jupiterBaseUrl,
  phoenixBaseUrl,
} from "./env-url.js";

export const EnvSchema = z.object({
  SOLANA_RPC_URL: z.string().url("SOLANA_RPC_URL must be a URL").optional(),
  SOLANA_WS_URL: z.string().url().optional(),
  SOLOS_SIGNER_PRIVATE_KEY: z.string().min(1).optional(),
  SOLOS_SIGNER_KEYPAIR_PATH: z.string().min(1).optional(),
  SOLOS_PROFILE: z.string().min(1).optional(),
  // `direct` signs locally. `engine` forwards simulate and execute to a solos-engine process (ADR-0037).
  SOLOS_EXECUTOR: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["direct", "engine"]).default("direct"),
  ),
  SOLOS_ENGINE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url("SOLOS_ENGINE_URL must be a URL").optional(),
  ),
  SOLOS_ENGINE_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
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
  // Vercel AI Gateway: optional; with the key, JEV ranks free-text tool discovery.
  AI_GATEWAY_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  AI_GATEWAY_BASE_URL: z.preprocess(
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
 *   readonly signer: SignerSource | undefined;
 *   readonly executor: "direct" | "engine";
 *   readonly engine?: { readonly url: string; readonly token: string };
 *   readonly profile: string | undefined;
 *   readonly elfa: { readonly apiKey: string | undefined; readonly baseUrl: string };
 *   readonly jupiter: { readonly apiKey: string | undefined; readonly baseUrl: string };
 *   readonly phoenix: { readonly baseUrl: string };
 *   readonly kamino: { readonly market: string };
 *   readonly gateway: GatewayEnv;
 * }} SolanaEnv
 * @typedef {{ readonly apiKey: string | undefined; readonly baseUrl: string }} GatewayEnv
 */

/**
 * @param {Pick<z.infer<typeof EnvSchema>, "AI_GATEWAY_API_KEY" | "AI_GATEWAY_BASE_URL">} parsed
 * @returns {GatewayEnv}
 */
const gatewayEnv = (parsed) => ({
  apiKey: parsed.AI_GATEWAY_API_KEY,
  baseUrl: aiGatewayBaseUrl(parsed.AI_GATEWAY_BASE_URL),
});

/**
 * The AI Gateway settings alone, for callers that select tools without touching the chain: no
 * RPC URL or signer is required.
 * @param {Record<string, string | undefined>} env
 */
export const loadGatewayEnv = (env) =>
  gatewayEnv(EnvSchema.pick({ AI_GATEWAY_API_KEY: true, AI_GATEWAY_BASE_URL: true }).parse(env));

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
    throw new SignerConfigMissing({
      reason:
        "no signer: set SOLOS_SIGNER_KEYPAIR_PATH / SOLOS_SIGNER_PRIVATE_KEY, or run `solos login`",
      remedy: "run `solos login` to save a profile, or export SOLOS_SIGNER_KEYPAIR_PATH",
    });
  }
  return { signer: sourceFromProfile(selected.profile, env, selected.name), selected };
};

/**
 * @param {{
 *   parsed: z.infer<typeof EnvSchema>;
 *   signer: SignerSource | undefined;
 *   selected: { name: string; profile: import("./credentials/profile.js").Profile } | undefined;
 *   engine: { readonly url: string; readonly token: string } | undefined;
 * }} input
 * @returns {SolanaEnv}
 */
const shapedEnv = ({ parsed, signer, selected, engine }) => {
  const rpcUrl = parsed.SOLANA_RPC_URL ?? selected?.profile.rpcUrl;
  if (rpcUrl === undefined) {
    throw new RpcConfigMissing({
      reason: "SOLANA_RPC_URL is not set and the profile has no rpcUrl; there is no default RPC",
      remedy: "export SOLANA_RPC_URL, or run `solos login --rpc-url <url>`",
    });
  }
  return {
    rpcUrl,
    wsUrl: parsed.SOLANA_WS_URL ?? deriveWsUrl(rpcUrl),
    signer,
    executor: parsed.SOLOS_EXECUTOR,
    ...(engine !== undefined && { engine }),
    profile: selected?.name,
    elfa: { apiKey: parsed.ELFA_API_KEY, baseUrl: elfaBaseUrl(parsed.ELFA_BASE_URL) },
    jupiter: { apiKey: parsed.JUPITER_API_KEY, baseUrl: jupiterBaseUrl(parsed.JUPITER_BASE_URL) },
    phoenix: { baseUrl: phoenixBaseUrl(parsed.PHOENIX_BASE_URL) },
    kamino: { market: parsed.KAMINO_LENDING_MARKET ?? KAMINO_MAIN_MARKET },
    gateway: gatewayEnv(parsed),
  };
};

/**
 * The engine holds the key. A local signer var is still rejected when both are set, and is
 * otherwise ignored: the Signer port reports the engine's address.
 * @param {z.infer<typeof EnvSchema>} parsed
 * @param {Record<string, string | undefined>} env
 * @param {{ readonly url: string; readonly token: string }} engine
 */
const engineEnv = (parsed, env, engine) => {
  signerFromEnv(parsed);
  return shapedEnv({ parsed, signer: undefined, selected: selectProfile(env), engine });
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
  const engine = engineCaller(parsed);
  if (engine !== undefined) return engineEnv(parsed, env, engine);
  const { signer, selected } = resolveSigner(parsed, env);
  return shapedEnv({ parsed, signer, selected, engine: undefined });
};
