// @ts-check
import { Prompt } from "@effect/cli";
import { KitSigner, KitSignerLive, saveProfile } from "@solos/solana";
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
