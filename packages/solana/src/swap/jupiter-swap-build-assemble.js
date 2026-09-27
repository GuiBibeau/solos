// @ts-check
import {
  AccountRole,
  appendTransactionMessageInstructions,
  getBase64Codec,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { assertV1MessageForSigning, beginV1Message } from "../executor/transaction-v1.js";
import { derivedAta } from "./jupiter-swap-build-setup-account.js";
import { ATA_PROGRAM, WSOL_MINT, dataBytes } from "./jupiter-swap-build-validate.js";

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
 * Explicit local bound on loaded account data bytes: never provider-chosen.
 *
 * The first value here was 16 MiB, chosen on 2026-09-20 as the smallest that passed one live
 * 0.001 SOL -> USDC route after 8 MiB failed it. One route is not the population: Jupiter picks
 * a different path per call, and the heavier ones load more. Measured 2026-09-24 with
 * `solos dev qa swap --amount-sol 0.1 --rounds 20`, 60 attempts per setting:
 *
 * | Limit  | ok       | MaxLoadedAccountsDataSizeExceeded |
 * |--------|----------|-----------------------------------|
 * | 16 MiB | 41 (68%) | 10 (17%)                          |
 * | 32 MiB | 59 (98%) | 0                                 |
 *
 * 24 MiB also cleared it over a smaller sample, so the boundary sits between 16 and 24. 32 MiB
 * is deliberately not that boundary — picking the smallest passing value is what put 16 MiB here
 * and left a sixth of real routes unusable. It is half the 64 MiB ceiling, so it keeps headroom
 * without reserving block-space accounting the swap cannot use.
 */
export const SWAP_LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 33_554_432;
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
 * The temp wSOL create rides from the provider as createIdempotent (Jupiter's live shape);
 * assembly pins it to exclusive creation (opcode 0) only when the preflight proved the account
 * absent. If it raced into existence since, the create fails and the transaction aborts instead
 * of adopting and closing that account (SPL Token unwraps a native account on close). When the
 * account was already there — empty — the idempotent create is kept, since an exclusive one would
 * fail on it. The destination ATA create always keeps idempotent semantics: it legitimately
 * pre-exists after a swap.
 * @param {RawInstruction} ix @param {string} tempWsol @param {boolean} tempWsolExisted
 */
const pinExclusiveTempCreate = (ix, tempWsol, tempWsolExisted) => {
  if (tempWsolExisted) return ix;
  if (ix.programId !== ATA_PROGRAM || ix.accounts[1]?.pubkey !== tempWsol) return ix;
  const bytes = dataBytes(ix.data);
  if (bytes.length !== 1 || bytes[0] === 0) return ix;
  return { ...ix, data: getBase64Codec().decode(Uint8Array.of(0)) };
};

/**
 * Assemble the validated envelope into one inline v1 message with the local resource config
 * and the configured RPC's fresh blockhash lifetime.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("../signer/kit-signer.js").KitCompatibleSigner} takerSigner
 * @param {{ lifetime: import("@solana/kit").BlockhashLifetimeConstraint; tempWsolExisted?: boolean }} parts
 */
export const assembleSwapMessage = async (
  envelope,
  takerSigner,
  { lifetime, tempWsolExisted = false },
) => {
  const tempWsol = await derivedAta(takerSigner.address, WSOL_MINT);
  // Only a cleanup-owned lifecycle grants the right to create-and-close the temp account; a
  // build without cleanup may legitimately use the canonical wSOL ATA durably, and its
  // idempotent create must survive for swaps from or into an existing wSOL position.
  const isCleanupOwned = envelope.cleanupInstruction !== null;
  const ordered = [
    ...envelope.setupInstructions.map((ix) =>
      isCleanupOwned ? pinExclusiveTempCreate(ix, tempWsol, tempWsolExisted) : ix,
    ),
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
