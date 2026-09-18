// @ts-check
/**
 * Byte-exact Token-2022 seed accounts for the Surfnet fixture family, all synthetic. Built by
 * `test-fixtures.js` from the program's verified layout: 82-byte base mint + 83 bytes of zero
 * padding + the AccountType byte at 165 + TLV records (u16 LE type + u16 LE length + value).
 */
import { address, getAddressEncoder } from "@solana/kit";
import {
  classicMintBytes,
  concat,
  token2022MintBytes,
  tokenMetadataValue,
  tlvRecord,
  zeros,
} from "./test-fixtures.js";

/** TransferFeeConfig::LEN — the extension every real transfer-fee mint carries first. */
const TRANSFER_FEE_CONFIG_LEN = 116;

const addressBytes = getAddressEncoder();
/** 32 bytes of an address as the metadata layouts embed them. @param {string} mint */
const mintBytes = (mint) => new Uint8Array(addressBytes.encode(address(mint)));

/** @param {Uint8Array} mint @param {ReadonlyArray<readonly [string, string]>} pairs */
const tokenMetadataRecord = (mint, pairs) =>
  tlvRecord(
    19,
    tokenMetadataValue({ mintBytes: mint, name: "Fixture Cat", symbol: "FCAT", uri: "", pairs }),
  );

/** @param {Uint8Array} mint @param {string} logo */
const withLogo = (mint, logo) => tokenMetadataRecord(mint, [["logo", logo]]);

/** The addresses a seed set needs. @typedef {{ readonly token2022WithExtension: string; readonly token2022RealShape: string; readonly token2022TailPadding: string; readonly token2022WrongPointer: string; readonly token2022ExtendedAccount: string; readonly token2022BadPadding: string; readonly token2022TruncatedTlv: string; readonly token2022OverrunTlv: string; readonly oversized: string }} Token2022SeedAddresses */

/** One account to write through the `surfnet_setAccount` cheatcode. @typedef {{ readonly account: string; readonly data: Uint8Array }} Token2022Seed */

/**
 * The decodable shapes: minimal extension, the exact real-chain shape, a foreign pointer.
 * @param {Token2022SeedAddresses} fx
 * @param {string} wsolMint
 * @returns {ReadonlyArray<Token2022Seed>}
 */
const decodableSeeds = (fx, wsolMint) => [
  {
    account: fx.token2022WithExtension,
    data: token2022MintBytes({
      decimals: 8,
      records: [
        tlvRecord(18, zeros(64)),
        withLogo(mintBytes(fx.token2022WithExtension), "https://fixture.example/cat.png"),
      ],
    }),
  },
  {
    // Real chain shape: fee config, self pointer, metadata; zero padding before AccountType.
    account: fx.token2022RealShape,
    data: token2022MintBytes({
      decimals: 6,
      records: [
        tlvRecord(1, zeros(TRANSFER_FEE_CONFIG_LEN)),
        tlvRecord(18, concat(zeros(32), mintBytes(fx.token2022RealShape))),
        withLogo(mintBytes(fx.token2022RealShape), "https://fixture.example/real.png"),
      ],
    }),
  },
  {
    // Permitted two-byte type-zero padding tail (multisig adjustment), no TokenMetadata
    // record: the walk must end cleanly so the mint's Metaplex PDA is reachable.
    account: fx.token2022TailPadding,
    data: token2022MintBytes({
      decimals: 6,
      records: [tlvRecord(1, zeros(TRANSFER_FEE_CONFIG_LEN)), new Uint8Array([0, 0])],
    }),
  },
  {
    account: fx.token2022WrongPointer,
    data: token2022MintBytes({
      decimals: 8,
      records: [tlvRecord(18, concat(zeros(32), mintBytes(wsolMint)))],
    }),
  },
];

/**
 * The malformed layouts: an extended token account, non-zero padding, a truncated TLV header,
 * and a TLV value crossing the account end — each must fail, never decode.
 * @param {Token2022SeedAddresses} fx
 * @returns {ReadonlyArray<Token2022Seed>}
 */
const malformedSeeds = (fx) => [
  {
    account: fx.token2022ExtendedAccount,
    data: token2022MintBytes({
      decimals: 0,
      accountType: 2,
      records: [tokenMetadataRecord(mintBytes(fx.token2022ExtendedAccount), [])],
    }),
  },
  {
    account: fx.token2022BadPadding,
    data: concat(
      classicMintBytes({ decimals: 6 }),
      new Uint8Array(83).fill(7),
      new Uint8Array([1]),
    ),
  },
  {
    account: fx.token2022TruncatedTlv,
    data: token2022MintBytes({ decimals: 6, records: [new Uint8Array([0x12, 0x34])] }),
  },
  {
    account: fx.token2022OverrunTlv,
    data: token2022MintBytes({
      decimals: 6,
      records: [concat(new Uint8Array([19, 0, 0x28, 0x23]), zeros(4))],
    }),
  },
  { account: fx.oversized, data: zeros(20_000) },
];

/**
 * Every Token-2022 seed account, decodable and malformed alike.
 * @param {Token2022SeedAddresses} fx
 * @param {string} wsolMint
 * @returns {ReadonlyArray<Token2022Seed>}
 */
export const token2022SeedAccounts = (fx, wsolMint) => [
  ...decodableSeeds(fx, wsolMint),
  ...malformedSeeds(fx),
];
