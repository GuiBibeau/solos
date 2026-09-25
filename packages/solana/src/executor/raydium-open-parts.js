// @ts-check
/**
 * Everything an open needs that depends on a freshly generated mint.
 *
 * The mint is created per transaction, used once, and never stored — it exists only so the
 * program can initialise the NFT it is about to hand to the owner. Every account the instruction
 * takes hangs off it, which is why the derivations live here rather than in the pure plan.
 */
import { generateKeyPairSigner } from "@solana/kit";
import { tickArrayStartIndex } from "../liquidity/raydium-clmm-accounts.js";
import { personalPositionAddress } from "../liquidity/raydium-clmm-decode.js";
import { TOKEN_2022_PROGRAM } from "../liquidity/raydium-clmm-instruction.js";
import { ata, deriveRaydiumAccounts } from "../liquidity/raydium-clmm-plan-reads.js";

/** @param {{ owner: string; action: any; pool: any; tickSpacing: number }} parts */
export const openParts = async ({ owner, action, pool, tickSpacing }) => {
  const nftSigner = await generateKeyPairSigner();
  const accounts = await deriveRaydiumAccounts({
    owner,
    positionAddress: await personalPositionAddress(nftSigner.address),
    // The position NFT is a Token-2022 mint on this instruction, so its ATA derives against that
    // program rather than the classic one.
    nftAccount: await ata(owner, nftSigner.address, TOKEN_2022_PROGRAM),
    position: {
      poolId: action.pool,
      nftMint: nftSigner.address,
      liquidity: 0n,
      tickLowerIndex: action.tickLower,
      tickUpperIndex: action.tickUpper,
    },
    pool,
  });
  return {
    nftSigner,
    startLower: tickArrayStartIndex(action.tickLower, tickSpacing),
    startUpper: tickArrayStartIndex(action.tickUpper, tickSpacing),
    accounts: {
      payer: owner,
      nftAccount: accounts.nftAccount,
      poolState: action.pool,
      protocolPosition: accounts.protocolPosition,
      tickArrayLower: accounts.tickArrayLower,
      tickArrayUpper: accounts.tickArrayUpper,
      personalPosition: accounts.personalPosition,
      tokenAccount0: accounts.tokenAccount0,
      tokenAccount1: accounts.tokenAccount1,
      tokenVault0: accounts.tokenVault0,
      tokenVault1: accounts.tokenVault1,
      vault0Mint: accounts.vault0Mint,
      vault1Mint: accounts.vault1Mint,
    },
  };
};
