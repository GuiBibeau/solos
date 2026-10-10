// @ts-check
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  address,
  appendTransactionMessageInstructions,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { beginV1Message } from "../executor/transaction-v1.js";
import { TRANSFER_V1_CONFIG } from "../executor/transfer-sol.js";
import { jsonRpc } from "./surfnet-cli.js";

const SPEND = 2_000_000_000n;

/**
 * Broadcast a transfer the runtime rejects, and return the fee it still paid.
 * Fund the seed with less than 2 SOL first. The fee payer can still pay the fee.
 * @param {string} rpcUrl
 * @param {Uint8Array} seed
 * @param {string} to
 */
export const broadcastFailingTransfer = async (rpcUrl, seed, to) => {
  const signed = await signOverspend(seed, to, await lifetimeOf(rpcUrl));
  const signature = getSignatureFromTransaction(signed.transaction);
  await jsonRpc(rpcUrl, "sendTransaction", [
    signed.wire,
    { encoding: "base64", skipPreflight: true },
  ]);
  await waitUntilFailed(rpcUrl, signature);
  return { signature, fee: await waitForFee(rpcUrl, signature) };
};

/** @param {string} rpcUrl */
const lifetimeOf = async (rpcUrl) => {
  const latest = await jsonRpc(rpcUrl, "getLatestBlockhash", [{ commitment: "confirmed" }]);
  const value = /** @type {{ blockhash: string; lastValidBlockHeight: number }} */ (latest.value);
  return {
    blockhash: /** @type {import("@solana/kit").Blockhash} */ (value.blockhash),
    lastValidBlockHeight: BigInt(value.lastValidBlockHeight),
  };
};

/**
 * @param {Uint8Array} seed
 * @param {string} to
 * @param {import("@solana/kit").BlockhashLifetimeConstraint} lifetime
 */
const signOverspend = async (seed, to, lifetime) => {
  const signer = await createMemorySignerFromBytes(seed);
  const message = pipe(
    beginV1Message({ feePayerSigner: signer, config: TRANSFER_V1_CONFIG }),
    (current) => setTransactionMessageLifetimeUsingBlockhash(lifetime, current),
    (current) =>
      appendTransactionMessageInstructions(
        [
          getTransferSolInstruction({
            source: signer,
            destination: address(to),
            amount: lamports(SPEND),
          }),
        ],
        current,
      ),
  );
  const transaction = await signTransactionMessageWithSigners(message);
  return { transaction, wire: getBase64EncodedWireTransaction(transaction) };
};

/** @param {string} rpcUrl @param {string} signature */
const waitUntilFailed = async (rpcUrl, signature) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (isFailed(await readStatus(rpcUrl, signature))) return;
    await Bun.sleep(200);
  }
  throw new Error("landed execution error was not visible");
};

/** @param {string} rpcUrl @param {string} signature */
const readStatus = (rpcUrl, signature) =>
  jsonRpc(rpcUrl, "getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);

/** @param {unknown} response */
const isFailed = (response) => {
  const row = /** @type {{ value?: unknown[] } | null} */ (response)?.value?.[0];
  if (row === null || typeof row !== "object") return false;
  const status = /** @type {{ confirmationStatus?: unknown; err?: unknown }} */ (row);
  const isConfirmed =
    status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized";
  return isConfirmed && status.err !== null && status.err !== undefined;
};

/** @param {string} rpcUrl @param {string} signature */
const waitForFee = async (rpcUrl, signature) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const fee = feeOf(await readTransaction(rpcUrl, signature));
    if (fee !== undefined) return fee;
    await Bun.sleep(200);
  }
  throw new Error("landed fee was not visible");
};

/** @param {string} rpcUrl @param {string} signature */
const readTransaction = (rpcUrl, signature) =>
  jsonRpc(rpcUrl, "getTransaction", [
    signature,
    { commitment: "confirmed", encoding: "json", maxSupportedTransactionVersion: 1 },
  ]);

/** @param {unknown} found */
const feeOf = (found) => {
  const fee = /** @type {{ meta?: { fee?: unknown } | null } | null} */ (found)?.meta?.fee;
  if (typeof fee === "bigint" && fee >= 0n) return fee;
  if (typeof fee === "number" && Number.isSafeInteger(fee) && fee >= 0) return BigInt(fee);
  return undefined;
};
