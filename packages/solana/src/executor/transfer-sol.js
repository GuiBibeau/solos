// @ts-check
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { BuildRejected, RpcError, TransactionFailed } from "@solos/core";
import { Effect } from "effect";
import { describeError, rpcCall } from "../rpc/rpc-call.js";
import { assertV1WireForSubmission, beginV1Message, signV1Message } from "./transaction-v1.js";

/**
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("@solos/actions").TransferSolAction} TransferSolAction
 * @typedef {Awaited<ReturnType<typeof signV1Message>>} Signed
 */

export const TRANSFER_V1_CONFIG = Object.freeze({
  computeUnitLimit: 50_000,
  loadedAccountsDataSizeLimit: 8_388_608,
  priorityFeeLamports: 1000n,
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

/** Reject non-v1 or mutated bytes before an RPC object is touched. @param {Signed} signed */
const wireForRpc = (signed) =>
  Effect.try({
    try: () => {
      const wire = getBase64EncodedWireTransaction(signed);
      assertV1WireForSubmission(wire);
      return wire;
    },
    catch: (error) =>
      error instanceof BuildRejected
        ? error
        : new BuildRejected({ reason: "transaction encoding failed before RPC; nothing was sent" }),
  });

/**
 * Simulate a signed transaction. Returns the raw RPC view; the executor shapes it.
 * @param {Rpc} ctx
 * @param {Signed} signed
 */
export const simulateSigned = (ctx, signed) =>
  Effect.flatMap(wireForRpc(signed), (wire) =>
    rpcCall("simulateTransaction", ctx.url, () =>
      ctx.rpc.simulateTransaction(wire, { encoding: "base64" }).send(),
    ).pipe(
      Effect.map(({ value }) => ({
        err: value.err,
        logs: [...(value.logs ?? [])],
        unitsConsumed: (value.unitsConsumed ?? 0n).toString(),
      })),
    ),
  );

/**
 * Send and wait for confirmation.
 * @param {Rpc} ctx
 * @param {Signed} signed
 */
export const sendSigned = (ctx, signed) => {
  assertIsTransactionWithBlockhashLifetime(signed);
  const signature = getSignatureFromTransaction(signed);
  return Effect.flatMap(wireForRpc(signed), () => {
    const confirm = sendAndConfirmTransactionFactory({
      rpc: ctx.rpc,
      rpcSubscriptions: ctx.rpcSubscriptions,
    });
    return Effect.tryPromise({
      try: () => confirm(signed, { commitment: "confirmed" }),
      catch: (error) => new TransactionFailed({ signature, reason: describeError(error) }),
    });
  }).pipe(Effect.as(signature), Effect.withSpan("rpc.sendAndConfirmTransaction"));
};
