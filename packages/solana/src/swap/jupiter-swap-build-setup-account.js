// @ts-check
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { TOKEN_PROGRAM, WSOL_MINT } from "./jupiter-swap-build-validate.js";

/** @typedef {import("./jupiter-swap-build-response.js").RawInstruction} RawInstruction */

/**
 * Derive the taker's associated account under the instruction's token program.
 * @param {string} owner @param {string} mint @param {string} [tokenProgram]
 */
export const derivedAta = async (owner, mint, tokenProgram = TOKEN_PROGRAM) => {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(tokenProgram),
  });
  return ata;
};

/**
 * Bind an idempotent ATA create to the taker and requested swap mints.
 * @param {RawInstruction} ix
 * @param {import("@solos/actions").SwapAction} action @param {string} taker
 */
export const ataCreateRejection = async (ix, action, taker) => {
  const [payer, account, owner, mint, , tokenProgram] = ix.accounts.map((a) => a.pubkey);
  if (payer !== taker) return "setup ATA create payer was not the taker";
  if (owner !== taker) return "setup ATA create owner was not the taker";
  if (mint !== action.inputMint && mint !== action.outputMint) {
    return "setup ATA create mint was not one of the requested swap mints";
  }
  const expected = await derivedAta(taker, mint, tokenProgram);
  return account === expected
    ? undefined
    : "setup ATA create did not target the taker's derived associated token account";
};

/**
 * Bind cleanup to the taker's temporary wSOL account, rent destination, and authority.
 * @param {RawInstruction} cleanup @param {string} taker
 */
export const cleanupBindingRejection = async (cleanup, taker) => {
  const tempWsol = await derivedAta(taker, WSOL_MINT);
  if (cleanup.accounts[0]?.pubkey !== tempWsol) {
    return "cleanup did not close the taker's temporary wSOL account";
  }
  if (cleanup.accounts[1]?.pubkey !== taker) {
    return "cleanup rent destination was not the taker";
  }
  if (cleanup.accounts[2]?.pubkey !== taker) return "cleanup authority was not the taker";
  return undefined;
};
