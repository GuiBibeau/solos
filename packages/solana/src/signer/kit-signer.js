// @ts-check
import { createKeychainSigner } from "@solana/keychain";
import {
  createMemorySignerFromBytes,
  createMemorySignerFromKeypairFile,
  createMemorySignerFromPrivateKeyString,
} from "@solana/keychain-memory";
import { SignerUnavailable } from "@solos/core";
import { Context, Effect, Layer } from "effect";
import { privyApi } from "../privy/api.js";
import { privyConfig } from "../privy/config.js";
import { createPrivyOAuthSigner } from "../privy/oauth-signer.js";
import { describeError } from "../rpc/rpc-call.js";
import { exportPayAccount } from "./pay-account.js";

/**
 * Adapter-internal handle to a Kit-compatible signer produced by @solana/keychain.
 * @typedef {import("@solana/kit").TransactionSigner & import("@solana/kit").MessageSigner} KitCompatibleSigner
 * @typedef {{ readonly backend: string; readonly signer: KitCompatibleSigner }} KitSignerShape
 * @typedef {import("../credentials/resolve.js").SignerSource} SignerSource
 */

export const KitSigner = /** @type {Context.Tag<KitSignerShape, KitSignerShape>} */ (
  Context.GenericTag("@solos/solana/KitSigner")
);

/**
 * @param {string} backend
 * @param {() => Promise<KitCompatibleSigner>} create
 */
const fromFactory = (backend, create) =>
  Layer.effect(
    KitSigner,
    Effect.tryPromise({
      try: create,
      catch: (error) => new SignerUnavailable({ backend, reason: describeError(error) }),
    }).pipe(Effect.map((signer) => ({ backend, signer }))),
  );

/** @param {Extract<SignerSource, { kind: "privy" }>} source */
const privyUser = (source) =>
  Promise.resolve(
    /** @type {KitCompatibleSigner} */ (
      /** @type {unknown} */ (
        createPrivyOAuthSigner({
          api: privyApi({ ...privyConfig(process.env), appId: source.appId }),
          walletId: source.walletId,
          walletAddress: source.walletAddress,
          session: source.session,
          persist: source.persist,
        })
      )
    ),
  );

/** @param {Extract<SignerSource, { kind: "privy-server" }>} source */
const privyServer = (source) =>
  createKeychainSigner({
    backend: "privy",
    appId: source.appId,
    appSecret: source.appSecret,
    walletId: source.walletId,
    ...(source.authorizationPrivateKey && {
      authorizationContext: { authorization_private_keys: [source.authorizationPrivateKey] },
    }),
  });

/**
 * One factory per signer source (ADR-0015). Vendor backends go through the keychain umbrella, so
 * a new provider is a new case here plus a profile schema, nothing else.
 * @param {SignerSource} source
 */
export const KitSignerLive = (source) => {
  switch (source.kind) {
    case "privateKey": {
      return fromFactory("memory:private-key", () =>
        createMemorySignerFromPrivateKeyString(source.value),
      );
    }
    case "keypairPath": {
      return fromFactory("memory:keypair-file", () =>
        createMemorySignerFromKeypairFile(source.path),
      );
    }
    case "pay": {
      return fromFactory(`pay:${source.account}`, async () =>
        createMemorySignerFromBytes(await exportPayAccount(source.account)),
      );
    }
    case "privy": {
      return fromFactory("privy:user-wallet", () => privyUser(source));
    }
    case "privy-server": {
      return fromFactory("privy:server-wallet", () => privyServer(source));
    }
    default: {
      return Layer.fail(
        new SignerUnavailable({ backend: "unknown", reason: "unsupported source" }),
      );
    }
  }
};

/** Test helper: an in-memory signer from a 32-byte seed or 64-byte keypair. */
/** @param {Uint8Array} bytes */
export const KitSignerFromBytes = (bytes) =>
  fromFactory("memory:bytes", () => createMemorySignerFromBytes(bytes));
