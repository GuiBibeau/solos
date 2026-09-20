// @ts-check
import {
  AccountRole,
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { assertV1MessageForSigning, beginV1Message } from "../executor/transaction-v1.js";
import { dataBytes } from "./jupiter-swap-build-validate.js";

/**
 * Assembly of one Jupiter V2 build into exactly one Kit v1 transaction message. The provider's
 * complete account list rides inline: v1 messages carry no lookup tables, and the resolved
 * `addressesByLookupTableAddress` needed no RPC fetch to begin with. Provider compute-budget
 * instructions are stripped — they are no-ops in v1, and resource policy is explicit local
 * config instead. The order stays the documented one: setup, swap, cleanup. `tipInstruction`
 * never assembles — validation has already rejected it. The taker's signer-role accounts are
 * attached as the keychain signer object so `signTransactionMessageWithSigners` signs them.
 */

/** Explicit local compute-unit budget: never provider-chosen; tunable after funded QA. */
export const SWAP_COMPUTE_UNIT_LIMIT = 400_000;
/**
 * Explicit local bound on loaded account data bytes: never provider-chosen, tunable after
 * funded QA. 8 MiB failed a real 0.001 SOL -> USDC Metis route simulation with
 * MaxLoadedAccountsDataSizeExceeded; 16 MiB passed the same real simulation (simulation only,
 * nothing was sent). Verified 2026-09-20 against the live route.
 */
export const SWAP_LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 16_777_216;
/** Local total priority fee in lamports: the cap, paid as-is, never provider-derived. */
export const SWAP_MAX_PRIORITY_FEE_LAMPORTS = 100_000n;
/** Conservative pre-sign bounds, enforced with fixed reasons before any signer is involved. */
const MAX_UNIQUE_ADDRESSES = 64;
const MAX_SERIALIZED_BYTES = 4096;

/** @typedef {import("./jupiter-swap-build-response.js").RawInstruction} RawInstruction */

/**
 * One raw provider instruction to a Kit instruction. The taker's accounts become signer-role
 * metas carrying the keychain signer; everyone else keeps their documented metas.
 * @param {RawInstruction} ix
 * @param {import("../signer/kit-signer.js").KitCompatibleSigner} takerSigner
 */
const toKitInstruction = (ix, takerSigner) => ({
  programAddress: /** @type {import("@solana/kit").Address} */ (
    /** @type {unknown} */ (ix.programId)
  ),
  accounts: ix.accounts.map((account) => ({
    address: /** @type {import("@solana/kit").Address} */ (/** @type {unknown} */ (account.pubkey)),
    role: roleFor(account, takerSigner.address),
    signer: account.isSigner ? takerSigner : undefined,
  })),
  data: dataBytes(ix.data),
});

/**
 * @param {{ pubkey: string; isWritable: boolean; isSigner: boolean }} account
 * @param {string} taker
 */
const roleFor = (account, taker) => {
  if (account.isSigner) {
    if (account.pubkey !== taker) throw new Error("build validation missed a foreign signer");
    return account.isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  }
  return account.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
};

/**
 * Assemble the validated envelope into one inline v1 message with the local resource config
 * and the configured RPC's fresh blockhash lifetime.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("../signer/kit-signer.js").KitCompatibleSigner} takerSigner
 * @param {import("@solana/kit").BlockhashLifetimeConstraint} lifetime
 */
export const assembleSwapMessage = (envelope, takerSigner, lifetime) => {
  const ordered = [
    ...envelope.setupInstructions,
    envelope.swapInstruction,
    ...(envelope.cleanupInstruction ? [envelope.cleanupInstruction] : []),
  ];
  const message = appendTransactionMessageInstructions(
    ordered.map((ix) => toKitInstruction(ix, takerSigner)),
    beginV1Message({
      feePayerSigner: takerSigner,
      config: {
        computeUnitLimit: SWAP_COMPUTE_UNIT_LIMIT,
        loadedAccountsDataSizeLimit: SWAP_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
        priorityFeeLamports: SWAP_MAX_PRIORITY_FEE_LAMPORTS,
      },
    }),
  );
  return setTransactionMessageLifetimeUsingBlockhash(lifetime, message);
};

/**
 * Pre-sign enforcement: the message must be v1 and keep within the fixed unique-address and
 * serialized-byte bounds. Every violation is a fixed-reason `BuildRejected` thrown before a
 * signer is involved. Returns the asserted compiled message.
 * @param {Parameters<typeof assertV1MessageForSigning>[0]} message
 */
export const assertSwapMessageBounds = (message) => {
  const { compiled, bytes } = assertV1MessageForSigning(message);
  if (compiled.staticAccounts.length > MAX_UNIQUE_ADDRESSES)
    throw new BuildRejected({ reason: "build exceeded 64 unique addresses" });
  if (bytes.length > MAX_SERIALIZED_BYTES)
    throw new BuildRejected({ reason: "build exceeded 4096 serialized bytes" });
  return compiled;
};
