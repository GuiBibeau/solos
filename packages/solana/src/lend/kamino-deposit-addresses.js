// @ts-check
/**
 * The derived addresses the deposit plan needs: the vanilla supply obligation PDA and the
 * user-metadata PDA under the pinned klend program, plus the owner's associated token
 * account for the source. All pure derivations — no reads, no SDK instances.
 */
import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";

const addressEncoder = getAddressEncoder();

/**
 * The vanilla supply obligation PDA for one owner in one market: seeds tag 0, id 0, owner,
 * market, and two zero seeds — the pinned klend convention, never a scanned obligation.
 * @param {string} owner @param {string} market
 * @returns {Promise<string>}
 */
export const vanillaObligationAddress = async (owner, market) =>
  (
    await getProgramDerivedAddress({
      seeds: [
        new Uint8Array([0, 0]),
        addressEncoder.encode(address(owner)),
        addressEncoder.encode(address(market)),
        new Uint8Array(32),
        new Uint8Array(32),
      ],
      programAddress: address(KLEND_PROGRAM_ID),
    })
  )[0];

/** @param {string} owner @returns {Promise<string>} the user metadata PDA initObligation requires */
export const userMetadataAddress = async (owner) =>
  (
    await getProgramDerivedAddress({
      seeds: [new TextEncoder().encode("user_meta"), addressEncoder.encode(address(owner))],
      programAddress: address(KLEND_PROGRAM_ID),
    })
  )[0].toString();

/** @param {string} owner @param {string} mint @param {string} tokenProgram @returns {Promise<string>} */
export const associatedTokenAccount = async (owner, mint, tokenProgram) =>
  (
    await findAssociatedTokenPda({
      owner: address(owner),
      mint: address(mint),
      tokenProgram: address(tokenProgram),
    })
  )[0].toString();
