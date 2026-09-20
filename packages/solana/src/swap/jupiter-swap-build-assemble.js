// @ts-check
import {
  AccountRole,
  appendTransactionMessageInstructions,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getBase58Decoder,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { dataBytes } from "./jupiter-swap-build-validate.js";

/**
 * Assembly of one Jupiter V2 build into exactly one Kit v0 transaction message, in the order
 * the provider documents: our own compute-unit limit first, then the provider's compute budget
 * price, setup, swap, and cleanup instructions. `tipInstruction` never assembles — validation
 * has already rejected it. The message is compressed with the provider-resolved lookup tables
 * (no RPC table fetch), and the taker's signer-role accounts are attached as the keychain
 * signer object so `signTransactionMessageWithSigners` signs them.
 */

/**
 * Our own fixed limit: set locally so a provider-controlled limit can never inflate it.
 * Tunable after funded QA; under-provisioning fails honestly at simulation, before any send.
 */
export const SWAP_COMPUTE_UNIT_LIMIT = 400_000;

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
 * Assemble the validated envelope into one compressed v0 message. The taker address belongs to
 * the provided signer; the lookup-table map comes verbatim from the build envelope.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("../signer/kit-signer.js").KitCompatibleSigner} takerSigner
 */
export const assembleSwapMessage = (envelope, takerSigner) => {
  const ordered = [
    ...envelope.computeBudgetInstructions,
    ...envelope.setupInstructions,
    envelope.swapInstruction,
    ...(envelope.cleanupInstruction ? [envelope.cleanupInstruction] : []),
  ];
  const message = appendTransactionMessageInstructions(
    ordered.map((ix) => toKitInstruction(ix, takerSigner)),
    setTransactionMessageComputeUnitLimit(
      SWAP_COMPUTE_UNIT_LIMIT,
      setTransactionMessageFeePayerSigner(takerSigner, createTransactionMessage({ version: 0 })),
    ),
  );
  const lifetime = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: /** @type {import("@solana/kit").Blockhash} */ (
        /** @type {unknown} */ (
          getBase58Decoder().decode(Uint8Array.from(envelope.blockhashWithMetadata.blockhash))
        )
      ),
      lastValidBlockHeight: BigInt(envelope.blockhashWithMetadata.lastValidBlockHeight),
    },
    message,
  );
  return compressTransactionMessageUsingAddressLookupTables(
    lifetime,
    altMap(envelope.addressesByLookupTableAddress),
  );
};

/**
 * Provider-resolved lookup tables, normalized: null becomes no tables; every resolved key list
 * travels untouched so decompilation and simulation see the same accounts the chain will.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope["addressesByLookupTableAddress"]} addresses
 * @returns {Record<string, import("@solana/kit").Address[]>}
 */
const altMap = (addresses) =>
  /** @type {Record<string, import("@solana/kit").Address[]>} */ (
    /** @type {unknown} */ (Object.fromEntries(Object.entries(addresses ?? {})))
  );
