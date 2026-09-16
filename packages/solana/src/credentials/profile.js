// @ts-check
import { AddressSchema } from "@solos/actions";
import { z } from "zod";
import { PrivySessionSchema } from "../privy/session.js";

/**
 * A secret value may be a literal, `$ENV_VAR`, or `!shell command` (e.g. `!op read op://...`),
 * so the credentials file never has to contain the secret itself.
 */
export const SecretRefSchema = z.string().min(1).describe("literal, $ENV_VAR, or !command");

const base = {
  wallet: z.object({ address: AddressSchema }),
  rpcUrl: z.string().url().optional().describe("Default RPC for this profile; env still wins"),
  createdAt: z.number().int(),
};

/** A keypair file on this machine (Solana CLI format) or an inline secret. */
export const LocalProfileSchema = z.object({
  provider: z.literal("local"),
  keypairPath: z.string().min(1).optional(),
  privateKey: SecretRefSchema.optional(),
  ...base,
});

/** An account managed by the `pay` CLI; exported on demand, never copied. */
export const PayProfileSchema = z.object({
  provider: z.literal("pay"),
  account: z.string().min(1),
  ...base,
});

/**
 * A user's own Privy embedded wallet, reached through the agent OAuth grant created by
 * `solos login --provider privy`. No app secret anywhere; the session is the credential.
 */
export const PrivyProfileSchema = z.object({
  provider: z.literal("privy"),
  appId: z.string().min(1),
  walletId: z.string().min(1),
  session: PrivySessionSchema,
  ...base,
});

/** Privy server wallet owned by an app: for headless deployments that hold an app secret. */
export const PrivyServerProfileSchema = z.object({
  provider: z.literal("privy-server"),
  appId: z.string().min(1),
  appSecret: SecretRefSchema,
  walletId: z.string().min(1),
  authorizationPrivateKey: SecretRefSchema.optional(),
  ...base,
});

export const ProfileSchema = z.discriminatedUnion("provider", [
  LocalProfileSchema,
  PayProfileSchema,
  PrivyProfileSchema,
  PrivyServerProfileSchema,
]);

export const CredentialsFileSchema = z.object({
  version: z.literal(1),
  default: z.string().min(1).optional(),
  profiles: z.record(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/), ProfileSchema),
});

/** @typedef {z.infer<typeof ProfileSchema>} Profile */
/** @typedef {Profile["provider"]} ProviderName */
/** @typedef {z.infer<typeof CredentialsFileSchema>} CredentialsFile */

/** @type {ReadonlyArray<ProviderName>} */
export const PROVIDERS = ["privy", "local", "pay", "privy-server"];

/** @type {CredentialsFile} */
export const EMPTY_CREDENTIALS = { version: 1, profiles: {} };
