// @ts-check
/**
 * Whether a sealed transaction can still land. A blockhash is valid through its last valid
 * block height inclusive; `minBlocksRemaining` demands headroom on top of that. An expired
 * transaction can never land, so refusing here only ever means nothing was sent.
 */
import { TransactionExpired } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";

export const EXPIRED_AFTER_SIGNING =
  "the signed transaction expired before submission; nothing was sent";

/** @param {number} blocks */
const tooLittleLeft = (blocks) =>
  `the signed transaction had fewer than ${blocks} blocks of lifetime left; nothing was sent`;

/**
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {import("./sealed.js").Sealed} sealed
 * @param {import("./mode.js").SubmissionMode["lifetime"]} rules
 * @returns {Effect.Effect<void, import("@solos/core").RpcError | TransactionExpired>}
 */
export const assertLive = (ctx, sealed, rules) =>
  Effect.gen(function* () {
    const height = yield* rpcCall("getBlockHeight", ctx.url, () =>
      ctx.rpc.getBlockHeight({ commitment: rules.commitment }).send(),
    );
    const headroom = BigInt(rules.minBlocksRemaining);
    if (height + headroom <= sealed.lastValidBlockHeight) return;
    const reason =
      height > sealed.lastValidBlockHeight
        ? EXPIRED_AFTER_SIGNING
        : tooLittleLeft(rules.minBlocksRemaining);
    return yield* new TransactionExpired({ signature: sealed.signature, reason });
  });
