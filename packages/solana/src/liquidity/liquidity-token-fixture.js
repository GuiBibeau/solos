// @ts-check
/**
 * Pure token-program byte builders and the custody-volume seeder for Whirlpool fixtures:
 * an initialized mint with supply 1, and the plain SPL token account that custodies a
 * position NFT. Bytes are built with the program's own codecs — never through a JS Number.
 * Like the Whirlpool bytes themselves, these are written through `surfnet_setAccount`.
 */
import { address, getAddressDecoder, getBase16Decoder, none } from "@solana/kit";
import { AccountState, getMintEncoder, getTokenEncoder } from "@solana-program/token";
import { jsonRpc } from "../surfnet/surfnet-cli.js";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RENT_LAMPORTS = 1_461_600;

const addressFromBytes = getAddressDecoder();
/** A fresh, never-funded address; nothing else on the Surfnet holds it. */
export const randomAddress = () =>
  addressFromBytes.decode(crypto.getRandomValues(new Uint8Array(32)));

/** @param {string} rpcUrl */
const accountWriter =
  (rpcUrl) =>
  /**
   * @param {string} account
   * @param {string} owner
   * @param {Uint8Array} data
   */
  (account, owner, data) =>
    jsonRpc(rpcUrl, "surfnet_setAccount", [
      account,
      { lamports: RENT_LAMPORTS, data: getBase16Decoder().decode(data), owner, executable: false },
    ]);

/** @param {number} decimals @returns {Uint8Array} an initialized mint with supply 1 */
export const mintBytes = (decimals) =>
  new Uint8Array(
    getMintEncoder().encode({
      mintAuthority: none(),
      supply: 1n,
      decimals,
      isInitialized: true,
      freezeAuthority: none(),
    }),
  );

/** @param {string} owner @param {string} mint @returns {Uint8Array} one SPL token account holding the NFT */
export const nftBytes = (owner, mint) =>
  new Uint8Array(
    getTokenEncoder().encode({
      mint: address(mint),
      owner: address(owner),
      amount: 1n,
      delegate: none(),
      state: AccountState.Initialized,
      isNative: none(),
      delegatedAmount: 0n,
      closeAuthority: none(),
    }),
  );

/**
 * Seed `count` custody-only token accounts for one owner — distinct fresh mints with no
 * position behind them. Enough of these trip the enumeration candidate bound (ADR-0018).
 * @param {string} rpcUrl
 * @param {string} owner
 * @param {number} count
 */
export const seedTokenAccounts = async (rpcUrl, owner, count) => {
  const write = accountWriter(rpcUrl);
  const chunk = 50;
  for (let i = 0; i < count; i += chunk) {
    await Promise.all(
      Array.from({ length: Math.min(chunk, count - i) }, () =>
        write(randomAddress(), TOKEN_PROGRAM, nftBytes(owner, randomAddress())),
      ),
    );
  }
};
