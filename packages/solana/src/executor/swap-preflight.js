// @ts-check
import {
  address,
  assertIsTransactionWithBlockhashLifetime,
  getSignatureFromTransaction,
} from "@solana/kit";
import { getTokenDecoder } from "@solana-program/token";
import { BuildRejected, TransactionExpired } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { ownerBindingRejection } from "../swap/jupiter-swap-build-owner-binding.js";
import { derivedAta } from "../swap/jupiter-swap-build-setup-account.js";
import { ATA_PROGRAM, WSOL_MINT, dataBytes } from "../swap/jupiter-swap-build-validate.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope} Envelope */
/** @typedef {import("./swap-sol-build.js").Signed} Signed */

const EXPIRED_BEFORE_SIGNING =
  "the configured RPC lifetime expired before signing; nothing was signed or sent";
const EXPIRED_AFTER_SIGNING = "the signed transaction expired before submission; nothing was sent";
const PREEXISTING_WSOL =
  "the taker's pre-existing wSOL account holds a balance; cleanup would take it and its rent";
const PREEXISTING_WSOL_REMEDY =
  "unwrap or spend the wSOL balance first (spl-token close <the wSOL ATA>), then retry";
const MINT_NOT_FOUND = "a requested swap mint was not found on chain; nothing was signed or sent";

const tokenDecoder = getTokenDecoder();

/** @param {readonly [string, string]} data @returns {bigint} the account's token amount */
const wsolAmount = (data) => tokenDecoder.decode(dataBytes(data[0])).amount;

/**
 * The taker's canonical wSOL ATA is the account a swap build creates and closes. Absent or empty
 * is safe: cleanup closes an empty account and returns its rent to the taker. A funded one is a
 * refusal — closing it would sweep the taker's own wSOL balance and rent.
 * @param {Rpc} ctx @param {string} taker
 * @returns {import("effect").Effect.Effect<boolean, BuildRejected | import("@solos/core").RpcError>}
 *   true when the account pre-exists and is empty
 */
const requireSafeTemporaryWsol = (ctx, taker) =>
  Effect.gen(function* () {
    const account = yield* Effect.promise(() => derivedAta(taker, WSOL_MINT));
    const { value } = yield* rpcCall("getAccountInfo", ctx.url, () =>
      ctx.rpc.getAccountInfo(address(account), { encoding: "base64" }).send(),
    );
    if (value === null) return false;
    const amount = wsolAmount(/** @type {readonly [string, string]} */ (value.data));
    if (amount === 0n) return true;
    return yield* new BuildRejected({
      reason: PREEXISTING_WSOL,
      remedy: PREEXISTING_WSOL_REMEDY,
    });
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
 * Complete every read-only swap preflight before signing. Cleanup is safe when the exact
 * canonical wSOL ATA validated in the build is absent or empty before the transaction creates
 * it — closing an empty account only returns its rent to the taker — and when the route and setup
 * token programs match each requested mint's discovered on-chain owner. A crafted build can
 * consistently move a classic mint's party to the other token program, pass every static check,
 * and fail only on-chain.
 *
 * Returns whether the temp account already existed, so assembly can keep the provider's
 * idempotent create for it instead of pinning an exclusive one that would fail.
 * @param {Rpc} ctx
 * @param {{ envelope: Envelope; action: import("@solos/actions").SwapAction; taker: string }} bound
 */
export const preflightSwapBuild = (ctx, { envelope, action, taker }) =>
  Effect.gen(function* () {
    const tempWsolExisted = envelope.cleanupInstruction
      ? yield* requireSafeTemporaryWsol(ctx, taker)
      : false;
    const owners = yield* discoverMintOwners(ctx, envelope, action);
    const rejection = ownerBindingRejection(envelope, action, owners);
    if (rejection) return yield* new BuildRejected({ reason: rejection });
    const lifetime = yield* freshLifetime(ctx);
    return { lifetime, tempWsolExisted };
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
