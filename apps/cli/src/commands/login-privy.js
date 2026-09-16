// @ts-check
import { Prompt } from "@effect/cli";
import {
  KitSigner,
  KitSignerLive,
  privyApi,
  privyConfig,
  readCredentials,
  sessionFromTokens,
  sourceFromProfile,
} from "@solos/solana";
import { Effect } from "effect";
import { emit } from "../output.js";
import { persistProfile } from "./login-common.js";

/** @typedef {import("./login-local.js").Common} Common */

/** @param {string} line */
const say = (line) => Effect.sync(() => process.stderr.write(`${line}\n`));

/** Best effort, never fatal: like `open` in the official Privy CLI. */
/** @param {string} url */
const openBrowser = (url) =>
  Effect.sync(() => {
    const command = process.platform === "darwin" ? "open" : "xdg-open";
    try {
      Bun.spawn([command, url], { stdout: "ignore", stderr: "ignore" }).unref();
    } catch {
      // the URL is already printed
    }
  });

/**
 * If a Privy profile of this name exists, prove the grant still works by refreshing it.
 * Returns the address, or undefined when there is nothing valid to reuse.
 * @param {string} name
 */
const existingSession = (name) =>
  Effect.gen(function* () {
    const profile = readCredentials(process.env).profiles[name];
    if (profile?.provider !== "privy") return undefined;
    const source = sourceFromProfile(profile, process.env, name);
    const address = yield* Effect.map(KitSigner, (k) => k.signer.address).pipe(
      Effect.provide(KitSignerLive(source)),
      Effect.option,
    );
    return address._tag === "Some" ? address.value : undefined;
  });

/**
 * RFC 8628 polling with `slow_down` back-off until Privy returns tokens.
 * @param {import("@solos/solana").PrivyApi} api
 * @param {import("@solos/solana").DeviceAuthorization} device
 */
const waitForApproval = (api, device) =>
  Effect.gen(function* () {
    const deadline = Date.now() + device.expires_in * 1000;
    let interval = Math.max(1, device.interval) * 1000;
    while (Date.now() < deadline) {
      yield* Effect.sleep(interval);
      const result = yield* Effect.promise(() => api.pollDeviceToken(device.device_code));
      if (result === "slow_down") interval += 5000;
      else if (result !== "pending") return result;
    }
    return yield* Effect.fail(
      new Error("Privy login timed out; run `solos login --provider privy` again"),
    );
  });

/**
 * @param {import("@solos/solana").PrivyWallet[]} wallets
 */
const chooseSolanaWallet = (wallets) =>
  Effect.gen(function* () {
    const solana = wallets.filter((w) => w.chain_type === "solana");
    if (solana.length === 0) {
      return yield* Effect.fail(
        new Error(
          "this Privy account has no Solana wallet; create one at https://agents.privy.io and log in again",
        ),
      );
    }
    if (solana.length === 1 || !process.stdin.isTTY)
      return /** @type {typeof solana[number]} */ (solana[0]);
    return yield* Prompt.select({
      message: "Which Solana wallet should solOS use?",
      choices: solana.map((w) => ({ title: w.address, value: w, description: w.id })),
    });
  });

/**
 * `--provider privy`: log in to Privy in the browser (device code), receive a scoped grant to the
 * user's own embedded wallet, store the session. No app secret is involved (ADR-0015).
 * @param {Common} common
 * @param {{ force: boolean }} options
 */
export const loginPrivy = (common, options) =>
  Effect.gen(function* () {
    if (!options.force) {
      const address = yield* existingSession(common.name);
      if (address)
        return yield* emit({
          profile: common.name,
          provider: "privy",
          address,
          alreadyLoggedIn: true,
        });
    }
    const config = privyConfig(process.env);
    const api = privyApi(config);
    const device = yield* Effect.promise(() => api.startDeviceAuthorization());
    yield* say(`Open ${device.verification_uri_complete}`);
    yield* say(
      `Code: ${device.user_code}   (waiting for approval, ${Math.round(device.expires_in / 60)} min)`,
    );
    yield* openBrowser(device.verification_uri_complete);
    const tokens = yield* waitForApproval(api, device);
    const { session, wallets } = yield* Effect.promise(() => sessionFromTokens(api, tokens));
    const wallet = yield* chooseSolanaWallet(wallets);
    yield* persistProfile({
      name: common.name,
      setDefault: common.setDefault,
      profile: {
        provider: "privy",
        appId: config.appId,
        walletId: wallet.id,
        session,
        rpcUrl: common.rpcUrl,
        wallet: { address: wallet.address },
        createdAt: Date.now(),
      },
    });
  });
