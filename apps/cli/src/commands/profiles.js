// @ts-check
import { Args, Command } from "@effect/cli";
import { credentialsPath, readCredentials, removeProfile, setDefaultProfile } from "@solos/solana";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";

/** Secrets never leave the file: list shows provider, address, and which is default. */
const list = Command.make("list", {}, () =>
  Effect.sync(() => {
    const credentials = readCredentials(process.env);
    return {
      file: credentialsPath(process.env),
      default: credentials.default ?? null,
      active: process.env.SOLOS_PROFILE ?? credentials.default ?? null,
      profiles: Object.entries(credentials.profiles).map(([name, p]) => ({
        name,
        provider: p.provider,
        address: p.wallet.address,
        rpcUrl: p.rpcUrl ?? null,
      })),
    };
  }).pipe(Effect.flatMap(emit)),
).pipe(Command.withDescription("List saved wallet profiles"));

const name = Args.text({ name: "profile" });

const setDefault = Command.make("default", { name }, (o) =>
  Effect.sync(() => setDefaultProfile(process.env, o.name))
    .pipe(Effect.flatMap(() => emit({ default: o.name })))
    .pipe(exitOnFailure),
).pipe(Command.withDescription("Make a profile the default"));

const remove = Command.make("remove", { name }, (o) =>
  Effect.sync(() => removeProfile(process.env, o.name))
    .pipe(Effect.flatMap(() => emit({ removed: o.name })))
    .pipe(exitOnFailure),
).pipe(Command.withDescription("Forget a profile (vendor credentials are not revoked)"));

export const profiles = Command.make("profiles").pipe(
  Command.withDescription("Manage saved wallet profiles"),
  Command.withSubcommands([list, setDefault, remove]),
);
