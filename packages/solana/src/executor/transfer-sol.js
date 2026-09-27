// @ts-check
import {
  address,
  appendTransactionMessageInstructions,
  lamports,
  pipe,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { BuildRejected, RpcError, TRANSFER_PRIORITY_FEE_LAMPORTS } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { beginV1Message, signV1Message } from "./transaction-v1.js";

/**
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("@solos/actions").TransferSolAction} TransferSolAction
 * @typedef {Awaited<ReturnType<typeof signV1Message>>} Signed
 */

export const TRANSFER_V1_CONFIG = Object.freeze({
  computeUnitLimit: 50_000,
  loadedAccountsDataSizeLimit: 8_388_608,
  priorityFeeLamports: TRANSFER_PRIORITY_FEE_LAMPORTS,
});

/**
 * Fetch a blockhash, build a policy-configured v1 SOL transfer, and sign it.
 * @param {Rpc} ctx
 * @param {Kit} kit
 * @param {TransferSolAction} action
 */
export const buildSignedTransfer = (ctx, kit, action) =>
  Effect.gen(function* () {
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const instruction = getTransferSolInstruction({
      source: kit.signer,
      destination: address(action.to),
      amount: lamports(BigInt(action.lamports)),
    });
    const message = pipe(
      beginV1Message({ feePayerSigner: kit.signer, config: TRANSFER_V1_CONFIG }),
      (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
      (m) => appendTransactionMessageInstructions([instruction], m),
    );
    return yield* Effect.tryPromise({
      try: () => signV1Message(message),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new RpcError({ method: "signTransaction", url: ctx.url, reason: "signing failed" }),
    });
  });
