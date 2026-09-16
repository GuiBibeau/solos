// @ts-check
import { resolveSecretRef } from "@solos/solana";
import { Effect, Option } from "effect";
import { flagOrPrompt, persistProfile, verifyAddress } from "./login-common.js";

/** @typedef {import("./login-local.js").Common} Common */

const SECRET_HINT = " (literal, $ENV_VAR, or !command)";

/**
 * `--provider privy-server`: an app-owned Privy server wallet for headless deployments that hold
 * an app secret (operators, not end users). End users log in with `--provider privy`.
 * @param {Common} common
 * @param {{ appId: Option.Option<string>; appSecret: Option.Option<string>; walletId: Option.Option<string>; authorizationKey: Option.Option<string> }} flags
 */
export const loginPrivyServer = (common, flags) =>
  Effect.gen(function* () {
    const appId = yield* flagOrPrompt(flags.appId, "Privy app id");
    const appSecret = yield* flagOrPrompt(flags.appSecret, `Privy app secret${SECRET_HINT}`, {
      secret: true,
    });
    const walletId = yield* flagOrPrompt(flags.walletId, "Privy wallet id");
    const authorizationPrivateKey = Option.getOrUndefined(flags.authorizationKey);
    const address = yield* verifyAddress({
      kind: "privy-server",
      appId,
      appSecret: resolveSecretRef(appSecret, process.env),
      walletId,
      ...(authorizationPrivateKey && {
        authorizationPrivateKey: resolveSecretRef(authorizationPrivateKey, process.env),
      }),
    });
    yield* persistProfile({
      name: common.name,
      setDefault: common.setDefault,
      profile: {
        provider: "privy-server",
        appId,
        appSecret,
        walletId,
        authorizationPrivateKey,
        rpcUrl: common.rpcUrl,
        wallet: { address },
        createdAt: Date.now(),
      },
    });
  });
