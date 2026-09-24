// @ts-check
import {
  address,
  assertIsTransactionWithBlockhashLifetime,
  getSignatureFromTransaction,
} from "@solana/kit";
import { BuildRejected, TransactionExpired } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { ownerBindingRejection } from "../swap/jupiter-swap-build-owner-binding.js";
import { derivedAta } from "../swap/jupiter-swap-build-setup-account.js";
import { ATA_PROGRAM, WSOL_MINT } from "../swap/jupiter-swap-build-validate.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope} Envelope */
/** @typedef {import("./swap-sol-build.js").Signed} Signed */

const EXPIRED_BEFORE_SIGNING =
  "the configured RPC lifetime expired before signing; nothing was signed or sent";
const EXPIRED_AFTER_SIGNING = "the signed transaction expired before submission; nothing was sent";
const PREEXISTING_WSOL =
  "cleanup targeted a pre-existing taker wSOL account; nothing was signed or sent";
const MINT_NOT_FOUND = "a requested swap mint was not found on chain; nothing was signed or sent";

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

/** Discover the token program that owns one requested mint account on chain.
 * @param {Rpc} ctx @param {string} mint */
const discoverMintOwner = (ctx, mint) =>
  Effect.gen(function* () {
    const { value } = yield* rpcCall("getAccountInfo", ctx.url, () =>
      ctx.rpc.getAccountInfo(address(mint), { encoding: "base64" }).send(),
    );
    if (value === null) return yield* new BuildRejected({ reason: MINT_NOT_FOUND });
    return value.owner;
  });

/**
 * Every mint whose on-chain owner the build's checks need: the requested pair, plus any mint a
 * setup ATA create names. A multi-hop route opens the taker's account for its intermediate
 * token, and `ownerBindingRejection` compares each create's token program against
 * `owners[mint]` — discovering only the pair leaves that `undefined` and refuses the build.
 * @param {Envelope} envelope @param {import("@solos/actions").SwapAction} action
 */
const mintsToDiscover = (envelope, action) => {
  const named = envelope.setupInstructions
    .filter((ix) => ix.programId === ATA_PROGRAM)
    .map((ix) => ix.accounts[3]?.pubkey)
    .filter((mint) => typeof mint === "string");
  return [...new Set([action.inputMint, action.outputMint, ...named])];
};

/** @param {Rpc} ctx @param {Envelope} envelope @param {import("@solos/actions").SwapAction} action */
const discoverMintOwners = (ctx, envelope, action) =>
  Effect.gen(function* () {
    const mints = mintsToDiscover(envelope, action);
    const owners = yield* Effect.all(
      mints.map((mint) => discoverMintOwner(ctx, mint)),
      { concurrency: mints.length },
    );
    return /** @type {Record<string, string>} */ (
      Object.fromEntries(mints.map((mint, index) => [mint, owners[index]]))
    );
  });

/**
 * Complete every read-only swap preflight before signing. Cleanup is safe only when the exact
 * canonical wSOL ATA validated in the build is absent before the transaction creates it, and
 * the route and setup token programs must match each requested mint's discovered on-chain
 * owner — a crafted build can consistently move a classic mint's party to the other token
 * program, pass every static check, and fail only on-chain.
 * @param {Rpc} ctx
 * @param {{ envelope: Envelope; action: import("@solos/actions").SwapAction; taker: string }} bound
 */
export const preflightSwapBuild = (ctx, { envelope, action, taker }) =>
  Effect.gen(function* () {
    if (envelope.cleanupInstruction) yield* requireAbsentTemporaryWsol(ctx, taker);
    const owners = yield* discoverMintOwners(ctx, envelope, action);
    const rejection = ownerBindingRejection(envelope, action, owners);
    if (rejection) return yield* new BuildRejected({ reason: rejection });
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
