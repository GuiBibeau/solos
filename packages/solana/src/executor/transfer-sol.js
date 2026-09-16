// @ts-check
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { TransactionFailed } from "@solos/core";
import { Effect } from "effect";
import { describeError, rpcCall } from "../rpc/rpc-call.js";

/**
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("@solos/actions").TransferSolAction} TransferSolAction
 * @typedef {Awaited<ReturnType<typeof signTransactionMessageWithSigners>>} Signed
 */

/**
 * Fetch a blockhash, build a v0 SOL transfer from the signer, and sign it.
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
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(kit.signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
      (m) => appendTransactionMessageInstructions([instruction], m),
    );
    return yield* rpcCall("signTransaction", ctx.url, () =>
      signTransactionMessageWithSigners(message),
    );
  });

/**
 * Simulate a signed transaction. Returns the raw RPC view; the executor shapes it.
 * @param {Rpc} ctx
 * @param {Signed} signed
 */
export const simulateSigned = (ctx, signed) =>
  rpcCall("simulateTransaction", ctx.url, () =>
    ctx.rpc
      .simulateTransaction(getBase64EncodedWireTransaction(signed), { encoding: "base64" })
      .send(),
  ).pipe(
    Effect.map(({ value }) => ({
      err: value.err,
      logs: [...(value.logs ?? [])],
      unitsConsumed: (value.unitsConsumed ?? 0n).toString(),
    })),
  );

/**
 * Send and wait for confirmation.
 * @param {Rpc} ctx
 * @param {Signed} signed
 */
export const sendSigned = (ctx, signed) => {
  assertIsTransactionWithBlockhashLifetime(signed);
  const signature = getSignatureFromTransaction(signed);
  const confirm = sendAndConfirmTransactionFactory({
    rpc: ctx.rpc,
    rpcSubscriptions: ctx.rpcSubscriptions,
  });
  return Effect.tryPromise({
    try: () => confirm(signed, { commitment: "confirmed" }),
    catch: (error) => new TransactionFailed({ signature, reason: describeError(error) }),
  }).pipe(Effect.as(signature), Effect.withSpan("rpc.sendAndConfirmTransaction"));
};
