// @ts-check
import { Prompt } from "@effect/cli";
import { discoverLocalWallets } from "@solos/solana";
import { Effect, Option } from "effect";
import { flagOrPrompt, persistProfile, verifyAddress } from "./login-common.js";

/**
 * @typedef {{ name: string; setDefault: boolean; rpcUrl: string | undefined }} Common
 */

/**
 * Offer what the machine already has: Solana CLI keypairs and `pay` accounts.
 * @param {"local" | "pay"} provider
 */
const pickDiscovered = (provider) =>
  Effect.gen(function* () {
    const wallets = (yield* Effect.promise(discoverLocalWallets)).filter(
      (w) => w.provider === provider,
    );
    if (wallets.length === 0 || !process.stdin.isTTY) return undefined;
    const choices = wallets.map((w) => ({
      title: w.provider === "local" ? w.keypairPath : `pay:${w.account} (${w.network})`,
      value: w,
      description: w.address,
    }));
    return yield* Prompt.select({
      message: `Found ${wallets.length} ${provider} wallet(s). Use one?`,
      choices: [...choices, { title: "Enter another", value: undefined, description: "" }],
    });
  });

/**
 * `--provider local`: a keypair file on this machine.
 * @param {Common} common
 * @param {Option.Option<string>} keypairFlag
 */
export const loginLocal = (common, keypairFlag) =>
  Effect.gen(function* () {
    const picked = Option.isNone(keypairFlag) ? yield* pickDiscovered("local") : undefined;
    const keypairPath =
      picked?.provider === "local"
        ? picked.keypairPath
        : yield* flagOrPrompt(keypairFlag, "Path to a Solana CLI keypair JSON file");
    const address = yield* verifyAddress({ kind: "keypairPath", path: keypairPath });
    yield* persistProfile({
      name: common.name,
      setDefault: common.setDefault,
      profile: {
        provider: "local",
        keypairPath,
        rpcUrl: common.rpcUrl,
        wallet: { address },
        createdAt: Date.now(),
      },
    });
  });

/**
 * `--provider pay`: an account managed by the `pay` CLI, exported on demand.
 * @param {Common} common
 * @param {Option.Option<string>} accountFlag
 */
export const loginPay = (common, accountFlag) =>
  Effect.gen(function* () {
    const picked = Option.isNone(accountFlag) ? yield* pickDiscovered("pay") : undefined;
    const account =
      picked?.provider === "pay"
        ? picked.account
        : yield* flagOrPrompt(accountFlag, "pay account name");
    const address = yield* verifyAddress({ kind: "pay", account });
    yield* persistProfile({
      name: common.name,
      setDefault: common.setDefault,
      profile: {
        provider: "pay",
        account,
        rpcUrl: common.rpcUrl,
        wallet: { address },
        createdAt: Date.now(),
      },
    });
  });
