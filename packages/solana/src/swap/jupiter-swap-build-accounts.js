// @ts-check
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  WSOL_MINT,
  dataBytes,
  echoRejection,
  minOutRejection,
  programRejection,
  signerRejection,
} from "./jupiter-swap-build-validate.js";

/**
 * Recipient and account-matching checks for one Jupiter V2 build. The swap must move funds
 * between the taker's own derived associated token accounts: the source is the taker's ATA of
 * the input mint, the destination the taker's ATA of the output mint (derived under either
 * token program), and both mints must appear as the route's market accounts. A wSOL funding
 * transfer in setup may only target the taker's own wSOL ATA. This is what makes "the intended
 * accounts receive the intended amounts" checkable before signing.
 */

/**
 * ATA derivation, attempted under the classic token program.
 * @param {string} owner
 * @param {string} mint
 */
const derivedAta = async (owner, mint) => {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(TOKEN_PROGRAM),
  });
  return ata;
};

/**
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action
 * @param {string} taker
 */
const accountsRejection = async (envelope, action, taker) => {
  const accounts = envelope.swapInstruction.accounts;
  const sourceAta = await derivedAta(taker, action.inputMint);
  const destinationAta = await derivedAta(taker, action.outputMint);
  if (accounts.every((a) => !(a.pubkey === sourceAta && a.isWritable))) {
    return "swap instruction did not spend the taker's source token account";
  }
  if (accounts.every((a) => !(a.pubkey === destinationAta && a.isWritable))) {
    return "swap instruction did not credit the taker's destination token account";
  }
  if (accounts.every((a) => !(a.pubkey === action.inputMint && a.isWritable))) {
    return "swap instruction did not carry the input mint's market account";
  }
  if (accounts.every((a) => !(a.pubkey === action.outputMint && a.isWritable))) {
    return "swap instruction did not carry the output mint's market account";
  }
  return wsolFundingRejection(envelope, taker, sourceAta);
};

/**
 * A System-program transfer in setup is only the documented wSOL funding step: allowed only for
 * wSOL input and only into the taker's own wSOL token account.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {string} taker
 * @param {string} sourceAta
 */
const wsolFundingRejection = async (envelope, taker, sourceAta) => {
  const transfers = envelope.setupInstructions.filter(
    (ix) => ix.programId === SYSTEM_PROGRAM && dataBytes(ix.data)[0] === 2,
  );
  if (transfers.length === 0) return undefined;
  if (envelope.inputMint !== WSOL_MINT) {
    return "setup moved native SOL without a wSOL input";
  }
  const wsolAta = await derivedAta(taker, WSOL_MINT);
  const ok = transfers.every(
    (ix) =>
      ix.accounts[0]?.pubkey === taker &&
      (ix.accounts[1]?.pubkey === wsolAta || ix.accounts[1]?.pubkey === sourceAta),
  );
  return ok ? undefined : "setup transfer did not fund the taker's own wSOL account";
};

/**
 * The full pre-sign build rejection: intent echo, minimum output, program allowlist, signer
 * allowlist, and recipient accounts. Undefined means the build is acceptable.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action
 * @param {string} taker
 * @returns {Promise<string | undefined>}
 */
export const buildRejection = async (envelope, action, taker) =>
  echoRejection(envelope, action) ??
  minOutRejection(envelope) ??
  programRejection(envelope) ??
  signerRejection(envelope, taker) ??
  (await accountsRejection(envelope, action, taker));
