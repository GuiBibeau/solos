// @ts-check
import { Prompt } from "@effect/cli";
import { ValidationError } from "@solos/core";
import { KitSigner, KitSignerLive, PROVIDERS, isAllowedEndpoint, saveProfile } from "@solos/solana";
import { Effect, Option, Redacted } from "effect";
import { emit } from "../output.js";

/**
 * Instantiate the signer once to prove the credential works and learn the address.
 * For vendors this is a real API call; for local files it just parses the keypair.
 * @param {import("@solos/solana").SignerSource} source
 */
export const verifyAddress = (source) =>
  Effect.map(KitSigner, (kit) => kit.signer.address).pipe(Effect.provide(KitSignerLive(source)));

/**
 * Persist a profile and print the result. Secrets are stored as given: a literal, `$ENV_VAR`,
 * or `!command`; the last two keep the secret out of the file.
 * @param {{
 *   name: string;
 *   profile: import("@solos/solana").Profile;
 *   setDefault: boolean;
 * }} input
 */
export const persistProfile = ({ name, profile, setDefault }) =>
  Effect.sync(() => saveProfile(process.env, { name, profile, setDefault })).pipe(
    Effect.flatMap((file) =>
      emit({
        profile: name,
        provider: profile.provider,
        address: profile.wallet.address,
        rpcUrl: profile.rpcUrl ?? null,
        file,
        hint: `export SOLOS_PROFILE=${name}`,
        next: "solos connect claude | codex | cursor",
      }),
    ),
  );

/**
 * Use the flag when given, otherwise prompt. Returns undefined when stdin is not a TTY and
 * nothing was given, so non-interactive callers get a clear error instead of a hang.
 * @param {Option.Option<string>} flag
 * @param {string} message
 * @param {{ secret?: boolean }} [options]
 */
export const flagOrPrompt = (flag, message, options = {}) =>
  Option.match(flag, {
    onSome: (value) => Effect.succeed(value),
    onNone: () => {
      if (!process.stdin.isTTY) return Effect.fail(new Error(`missing value: ${message}`));
      return options.secret
        ? Prompt.password({ message }).pipe(Effect.map((redacted) => Redacted.value(redacted)))
        : Prompt.text({ message });
    },
  });

/**
 * The origin of a URL for an error message, never the URL itself: a provider URL can carry a
 * credential in its path or query.
 * @param {string} raw
 */
const originOnly = (raw) => {
  try {
    return new URL(raw).origin;
  } catch {
    return "<not a URL>";
  }
};

const RPC_RULE = "https, or plain http on a loopback host";
const RPC_PROMPT = `RPC URL for this profile (mainnet; Helius, QuickNode and Triton have free tiers; ${RPC_RULE}). Leave blank to export SOLANA_RPC_URL yourself`;

/** @param {string} raw */
const invalidRpcUrl = (raw) =>
  new ValidationError({
    field: "rpcUrl",
    value: originOnly(raw),
    reason: `a profile stores an RPC URL only when it uses ${RPC_RULE}`,
    remedy: "pass --rpc-url with an https endpoint, or leave it out and export SOLANA_RPC_URL",
  });

/** Ask on a TTY; blank means the Operator will export `SOLANA_RPC_URL`. */
const promptRpcUrl = () =>
  Prompt.text({
    message: RPC_PROMPT,
    validate: (value) =>
      value === "" || isAllowedEndpoint(value)
        ? Effect.succeed(value)
        : Effect.fail(`enter an RPC URL using ${RPC_RULE}, or leave blank`),
  }).pipe(Effect.map((value) => (value === "" ? undefined : value)));

/** @param {string} value */
const fromFlag = (value) =>
  isAllowedEndpoint(value) ? Effect.succeed(value) : Effect.fail(invalidRpcUrl(value));

/** `SOLANA_RPC_URL` when it is set and a profile can store it. @param {NodeJS.ProcessEnv} env */
const storableEnvUrl = (env) => {
  const value = env.SOLANA_RPC_URL || undefined;
  return value !== undefined && isAllowedEndpoint(value) ? value : undefined;
};

/**
 * The RPC URL a new profile stores, checked against the profile's own endpoint rule before any
 * provider flow runs, so a bad value fails here and not after a browser login. The flag wins and
 * must pass the rule. Otherwise `SOLANA_RPC_URL` from the environment is the answer when it passes:
 * env wins at runtime anyway (ADR-0015), and a profile that carries the URL works in MCP clients
 * that pass no env. On a TTY with nothing storable, ask, because a profile with no rpcUrl is the
 * trap doctor reports as `ProfileRpcUrlMissing`. A non-TTY run with nothing storable stores nothing.
 * @param {Option.Option<string>} flag
 * @param {{ env?: NodeJS.ProcessEnv; isTTY?: boolean }} [io]
 */
export const resolveRpcUrl = (flag, io = {}) => {
  const { env = process.env, isTTY = process.stdin.isTTY === true } = io;
  if (Option.isSome(flag)) return fromFlag(flag.value);
  const fromEnv = storableEnvUrl(env);
  if (fromEnv !== undefined) return Effect.succeed(fromEnv);
  return isTTY ? promptRpcUrl() : Effect.succeed(undefined);
};

/** @typedef {(typeof PROVIDERS)[number]} Provider */

/** The providers an Operator picks from at the prompt; privy-server is for scripts with an app secret. */
const PROVIDER_CHOICES =
  /** @type {ReadonlyArray<{ title: string; value: Provider; description: string }>} */ ([
    {
      title: "A keypair file on this machine",
      value: "local",
      description: "Solana CLI keypairs under ~/.config/solana are listed",
    },
    { title: "Privy", value: "privy", description: "Log in with a browser; no key on disk" },
    { title: "A pay account", value: "pay", description: "An account of the pay CLI" },
  ]);

/**
 * Which wallet provider `login` uses: the flag, or a choice at the prompt, so `solos login` alone
 * is a complete first step. A non-interactive run must say.
 * @param {Option.Option<Provider>} flag
 * @param {{ isTTY?: boolean }} [io]
 */
export const resolveProvider = (flag, { isTTY = process.stdin.isTTY === true } = {}) => {
  if (Option.isSome(flag)) return Effect.succeed(flag.value);
  if (!isTTY) {
    return Effect.fail(
      new ValidationError({
        field: "provider",
        value: undefined,
        reason: "no --provider was given and there is no terminal to ask in",
        remedy: `pass --provider ${PROVIDERS.join("|")}`,
      }),
    );
  }
  return Prompt.select({ message: "Connect a wallet with", choices: PROVIDER_CHOICES });
};
