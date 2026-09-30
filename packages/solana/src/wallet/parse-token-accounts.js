// @ts-check
import { getBase64Encoder } from "@solana/kit";
import { getMintDecoder, getTokenDecoder } from "@solana-program/token";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
/** The base token-account layout; Token-2022 accounts carry at least this much. */
export const TOKEN_ACCOUNT_SIZE = 165;

/**
 * Whether an account can be decoded as a token account at all. Anyone can put a system-owned
 * account at a derived ATA address with a lamport transfer, and decoding that as a token account
 * throws; callers refuse such rows with a fixed reason instead of dying on them.
 * @param {{ readonly owner: string; readonly byteLength: number }} row
 */
export const isTokenAccountRow = ({ owner, byteLength }) =>
  (owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM) && byteLength >= TOKEN_ACCOUNT_SIZE;

const base64 = getBase64Encoder();
const tokenDecoder = getTokenDecoder();
const mintDecoder = getMintDecoder();

/** @typedef {{ pubkey: string; account: { data: readonly [string, string] } }} Base64AccountRow */
/** @typedef {{ pubkey: string; mint: string; amount: bigint }} RawTokenAccount */

/**
 * Decode base64 token accounts with the program's own codec. Token-2022 accounts carry
 * extensions after the base layout; the fixed-size decoder reads only the prefix, which is all we need.
 * @param {ReadonlyArray<Base64AccountRow>} rows
 * @returns {RawTokenAccount[]}
 */
export const decodeTokenAccounts = (rows) =>
  rows.map((row) => {
    const bytes = base64.encode(row.account.data[0]);
    const token = tokenDecoder.decode(bytes);
    return { pubkey: row.pubkey, mint: token.mint, amount: token.amount };
  });

/**
 * @param {string} base64Data
 * @returns {number} decimals
 */
export const decodeMintDecimals = (base64Data) =>
  mintDecoder.decode(base64.encode(base64Data)).decimals;

/**
 * @param {bigint} amount
 * @param {number} decimals
 */
export const formatUiAmount = (amount, decimals) => {
  if (decimals === 0) return amount.toString();
  const text = amount.toString().padStart(decimals + 1, "0");
  const whole = text.slice(0, -decimals);
  const fraction = text.slice(-decimals).replace(/0+$/, "");
  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
};

/**
 * @param {"token" | "token-2022"} program
 * @param {ReadonlyArray<RawTokenAccount>} accounts
 * @param {ReadonlyMap<string, number>} decimalsByMint
 * @returns {import("@solos/core/wallet").TokenBalance[]}
 */
export const toTokenBalances = (program, accounts, decimalsByMint) =>
  accounts.map((account) => {
    const decimals = decimalsByMint.get(account.mint) ?? 0;
    return {
      mint: account.mint,
      tokenAccount: account.pubkey,
      program,
      amount: account.amount.toString(),
      decimals,
      uiAmount: formatUiAmount(account.amount, decimals),
    };
  });
