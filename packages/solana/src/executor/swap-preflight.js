// @ts-check
import {
  address,
  assertIsTransactionWithBlockhashLifetime,
  getSignatureFromTransaction,
} from "@solana/kit";
import { BuildRejected, TransactionExpired } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { derivedAta } from "../swap/jupiter-swap-build-setup-account.js";
import { WSOL_MINT } from "../swap/jupiter-swap-build-validate.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope} Envelope */
/** @typedef {import("./swap-sol-build.js").Signed} Signed */

const EXPIRED_BEFORE_SIGNING =
  "the configured RPC lifetime expired before signing; nothing was signed or sent";
const EXPIRED_AFTER_SIGNING = "the signed transaction expired before submission; nothing was sent";
const PREEXISTING_WSOL =
  "cleanup targeted a pre-existing taker wSOL account; nothing was signed or sent";

/** @param {Rpc} ctx @param {string} taker */
const requireAbsentTemporaryWsol = (ctx, taker) =>
  Effect.gen(function* () {
    const account = yield* Effect.promise(() => derivedAta(taker, WSOL_MINT));
    const { value } = yield* rpcCall("getAccountInfo", ctx.url, () =>
      ctx.rpc.getAccountInfo(address(account), { encoding: "base64" }).send(),
    );
    if (value !== null) return yield* new BuildRejected({ reason: PREEXISTING_WSOL });
  });

/** Fetch an RPC-owned lifetime and prove it remains usable before any signer is invoked.
 * @param {Rpc} ctx */
const freshLifetime = (ctx) =>
  Effect.gen(function* () {
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const height = yield* rpcCall("getBlockHeight", ctx.url, () =>
      ctx.rpc.getBlockHeight({ commitment: "confirmed" }).send(),
    );
    if (height > lifetime.lastValidBlockHeight) {
      return yield* new BuildRejected({ reason: EXPIRED_BEFORE_SIGNING });
    }
    return lifetime;
  });

/**
 * Complete every read-only swap preflight before signing. Cleanup is safe only when the exact
 * canonical wSOL ATA validated in the build is absent before the transaction creates it.
 * @param {Rpc} ctx @param {Envelope} envelope @param {string} taker
 */
export const preflightSwapBuild = (ctx, envelope, taker) =>
  Effect.gen(function* () {
    if (envelope.cleanupInstruction) yield* requireAbsentTemporaryWsol(ctx, taker);
    return yield* freshLifetime(ctx);
  });

/** Reject a transaction that expired after signing with a truthful, signed-stage taxonomy.
 * @param {Rpc} ctx @param {Signed} signed */
export const recheckSignedSwapLifetime = (ctx, signed) =>
  Effect.gen(function* () {
    assertIsTransactionWithBlockhashLifetime(signed);
    const height = yield* rpcCall("getBlockHeight", ctx.url, () =>
      ctx.rpc.getBlockHeight({ commitment: "confirmed" }).send(),
    );
    if (height > signed.lifetimeConstraint.lastValidBlockHeight) {
      return yield* new TransactionExpired({
        signature: getSignatureFromTransaction(signed),
        reason: EXPIRED_AFTER_SIGNING,
      });
    }
  });
