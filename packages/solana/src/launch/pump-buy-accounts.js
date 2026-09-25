// @ts-check
/**
 * Every account `buy_exact_quote_in_v2` names, derived rather than taken on trust.
 *
 * The 16-account `buy_exact_sol_in` was tried first and the deployed program refused it with
 * `BuybackFeeRecipientMissing`: its account list has no slot for a buyback recipient the current
 * program requires. The v2 form carries one, and still takes an exact quote budget with an
 * enforceable minimum out — so it is the only instruction that satisfies both the contract and
 * the chain.
 *
 * The order here is the IDL's order at the pinned commit and the instruction is positional, so a
 * reordering is a different instruction. Seeds come from the IDL's own `pda` entries; the two
 * constants that are really addresses were decoded and checked, and `sharing_config` and
 * `fee_config` live under the fee program rather than pump.
 */
import { address, getAddressEncoder, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { PUMP_PROGRAM } from "./pump-program.js";

const utf8 = getUtf8Encoder();
const addressBytes = getAddressEncoder();

export const PUMP_FEE_PROGRAM = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/** SOL-paired curves quote in wrapped SOL; the transfer itself still moves native SOL. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** @param {Array<import("@solana/kit").ReadonlyUint8Array>} seeds @param {string} programAddress */
const pda = (seeds, programAddress) =>
  getProgramDerivedAddress({ programAddress: address(programAddress), seeds }).then(([key]) => key);

/** @param {string} key */
const keyBytes = (key) => new Uint8Array(addressBytes.encode(address(key)));

/** @param {string} creator */
export const creatorVaultAddress = (creator) =>
  pda([utf8.encode("creator-vault"), keyBytes(creator)], PUMP_PROGRAM);

export const eventAuthorityAddress = () => pda([utf8.encode("__event_authority")], PUMP_PROGRAM);

export const globalVolumeAccumulatorAddress = () =>
  pda([utf8.encode("global_volume_accumulator")], PUMP_PROGRAM);

/** @param {string} user */
export const userVolumeAccumulatorAddress = (user) =>
  pda([utf8.encode("user_volume_accumulator"), keyBytes(user)], PUMP_PROGRAM);

/** Under the fee program, seeded by the pump program id — not under pump itself. */
export const feeConfigAddress = () =>
  pda([utf8.encode("fee_config"), keyBytes(PUMP_PROGRAM)], PUMP_FEE_PROGRAM);

/** Also a fee-program PDA, seeded by the coin's own mint. @param {string} baseMint */
export const sharingConfigAddress = (baseMint) =>
  pda([utf8.encode("sharing-config"), keyBytes(baseMint)], PUMP_FEE_PROGRAM);

/** @param {string} owner @param {string} mint @param {string} tokenProgram */
export const associatedAccount = async (owner, mint, tokenProgram) => {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(tokenProgram),
  });
  return ata;
};

/**
 * @typedef {{
 *   mint: string; user: string; creator: string; feeRecipient: string;
 *   buybackFeeRecipient: string; bondingCurve: string; global: string; baseTokenProgram: string;
 * }} BuyAccountInputs
 */

/** @param {string} key */
const ro = (key) => ({ address: key, writable: false, signer: false });
/** @param {string} key */
const rw = (key) => ({ address: key, writable: true, signer: false });

/** The derived names, in the order their derivations are issued. */
const DERIVED = /** @type {const} */ ([
  "quoteFeeRecipient",
  "quoteBuyback",
  "baseCurve",
  "quoteCurve",
  "baseUser",
  "quoteUser",
  "quoteCreatorVault",
  "quoteUserVolume",
  "sharingConfig",
  "globalVolume",
  "eventAuthority",
  "feeConfig",
]);

/**
 * Every derived account, resolved together: each is independent, so one pass of `Promise.all`
 * costs what the slowest derivation does.
 * @param {BuyAccountInputs} input
 * @param {{ creatorVault: string; userVolume: string; base: string; quote: string }} parts
 * @returns {Promise<Record<(typeof DERIVED)[number], string>>}
 */
const derivedFor = async (input, { creatorVault, userVolume, base, quote }) => {
  const values = await Promise.all([
    associatedAccount(input.feeRecipient, WSOL_MINT, quote),
    associatedAccount(input.buybackFeeRecipient, WSOL_MINT, quote),
    associatedAccount(input.bondingCurve, input.mint, base),
    associatedAccount(input.bondingCurve, WSOL_MINT, quote),
    associatedAccount(input.user, input.mint, base),
    associatedAccount(input.user, WSOL_MINT, quote),
    associatedAccount(creatorVault, WSOL_MINT, quote),
    associatedAccount(userVolume, WSOL_MINT, quote),
    sharingConfigAddress(input.mint),
    globalVolumeAccumulatorAddress(),
    eventAuthorityAddress(),
    feeConfigAddress(),
  ]);
  return /** @type {any} */ (Object.fromEntries(DERIVED.map((key, i) => [key, values[i]])));
};

/**
 * The positional account list for `buy_exact_quote_in_v2`, in IDL order.
 * @param {BuyAccountInputs} input
 */
export const buyAccounts = async (input) => {
  const quote = TOKEN_PROGRAM;
  const base = input.baseTokenProgram;
  const [creatorVault, userVolume] = await Promise.all([
    creatorVaultAddress(input.creator),
    userVolumeAccumulatorAddress(input.user),
  ]);
  const d = await derivedFor(input, { creatorVault, userVolume, base, quote });
  return [
    ro(input.global),
    ro(input.mint),
    ro(WSOL_MINT),
    ro(base),
    ro(quote),
    ro(ATA_PROGRAM),
    rw(input.feeRecipient),
    rw(d.quoteFeeRecipient),
    rw(input.buybackFeeRecipient),
    rw(d.quoteBuyback),
    rw(input.bondingCurve),
    rw(d.baseCurve),
    rw(d.quoteCurve),
    { address: input.user, writable: true, signer: true },
    rw(d.baseUser),
    rw(d.quoteUser),
    rw(creatorVault),
    rw(d.quoteCreatorVault),
    ro(d.sharingConfig),
    ro(d.globalVolume),
    rw(userVolume),
    rw(d.quoteUserVolume),
    ro(d.feeConfig),
    ro(PUMP_FEE_PROGRAM),
    ro(SYSTEM_PROGRAM),
    ro(d.eventAuthority),
    ro(PUMP_PROGRAM),
  ];
};
