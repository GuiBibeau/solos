// @ts-check
import { getBase64Encoder } from "@solana/kit";
import { getMintDecoder } from "@solana-program/token";
import { CLASSIC_MINT_BYTES, token2022Layout } from "./token-2022-layout.js";

export {
  ACCOUNT_TYPE_OFFSET,
  CLASSIC_MINT_BYTES,
  EXTENSIONS_OFFSET,
  ACCOUNT_TYPE_MINT,
  MULTISIG_ACCOUNT_BYTES,
} from "./token-2022-layout.js";

/**
 * Program ids, pinned on chain. Declared locally instead of imported from the wallet slice so
 * the market slice stays decoupled from wallet internals; the two constants are duplicated
 * deliberately and are protocol constants, not configuration.
 */
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** Hard bound on any account we are willing to decode as a mint. */
export const MAX_MINT_ACCOUNT_BYTES = 16_384;

const base64 = getBase64Encoder();
const mintDecoder = getMintDecoder();

/** An account as returned by `getAccountInfo` with base64 data. @typedef {{ readonly owner: string; readonly data: Uint8Array }} RawAccount */

/** @typedef {import("./token-2022-layout.js").MintLayout} MintLayout */

/**
 * @param {string} owner
 * @returns {"spl" | "token-2022" | undefined}
 */
const programOf = (owner) => {
  if (owner === TOKEN_PROGRAM) return "spl";
  if (owner === TOKEN_2022_PROGRAM) return "token-2022";
  return undefined;
};

/**
 * Classic mints are exactly 82 bytes; Token-2022 mints carry at least the 82-byte base plus
 * the AccountType byte when extensions exist.
 * @param {"spl" | "token-2022"} program
 * @param {number} length
 * @returns {string | undefined}
 */
const lengthError = (program, length) => {
  if (program === "spl" && length !== CLASSIC_MINT_BYTES) {
    return "classic token program accounts are exactly 82 bytes; this is not a mint";
  }
  if (program === "token-2022" && length < CLASSIC_MINT_BYTES) {
    return "token-2022 mints are at least 82 bytes; this is not a mint";
  }
  return undefined;
};

/**
 * Base-decode the first 82 bytes with the program's own codec, then cut the Token-2022
 * extension area loose.
 * @param {RawAccount} account
 * @param {"spl" | "token-2022"} program
 * @returns {MintLayout}
 */
const decodeMint = (account, program) => {
  try {
    const mint = mintDecoder.decode(account.data);
    if (mint.isInitialized !== true)
      return { verdict: "not-a-mint", reason: "mint is not initialized" };
    if (program === "spl") {
      return { verdict: "mint", program, decimals: mint.decimals, extensions: undefined };
    }
    return token2022Layout(mint.decimals, account.data);
  } catch {
    return { verdict: "not-a-mint", reason: "account does not decode as a mint" };
  }
};

/**
 * Guard an account as a mint before any decode: owner first, then the per-program length
 * rules (a token account passed as a mint fails here, never "decodes"), then the absolute
 * size bound, and only then the base layout.
 * @param {RawAccount | null} account null when the RPC says the account does not exist
 * @returns {MintLayout}
 */
export const readMintLayout = (account) => {
  if (account === null) return { verdict: "not-a-mint", reason: "account does not exist" };
  const program = programOf(account.owner);
  if (program === undefined)
    return { verdict: "not-a-mint", reason: "owner is neither token program" };
  const badLength = lengthError(program, account.data.length);
  if (badLength !== undefined) return { verdict: "not-a-mint", reason: badLength };
  if (account.data.length > MAX_MINT_ACCOUNT_BYTES) {
    return { verdict: "account-too-large", bytes: account.data.length };
  }
  return decodeMint(account, program);
};

/**
 * Decode base64 account data from `getAccountInfo` into a plain mutable `Uint8Array`, so the
 * pure decode helpers never deal with Kit's readonly views.
 * @param {readonly [string, string]} data
 */
export const base64AccountData = (data) => new Uint8Array(base64.encode(data[0]));
