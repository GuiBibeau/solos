// @ts-check
/**
 * The deposit plan's chain-claim guards, each a plain reject-or-value: one mint row
 * (present, supported program, declared correspondence, no extensions), the obligation
 * row (the signer's own, vanilla-tagged, borrow-free supply obligation), and the source
 * token account (present, owned, funded). Everything runs on already-fetched rows.
 */
import { getTokenDecoder } from "@solana-program/token";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../wallet/parse-token-accounts.js";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";

/** Base mint size on both token programs; more bytes mean extensions. */
const BASE_MINT_SIZE = 82;
const tokenDecoder = getTokenDecoder();

/** @typedef {{ readonly owner: string; readonly bytes: Uint8Array; readonly state?: ObligationState }} FetchedRow */
/** @typedef {{ readonly status: "reject"; readonly reason: string }} DepositPlanReject */
/** @typedef {{ owner: string; lendingMarket: string; tag: number; borrows: unknown[]; deposits?: { depositReserve: string; depositedAmount: { toString: () => string } }[] }} DecodedObligation */
/** @typedef {DecodedObligation | undefined} ObligationState */

/** @param {string} reason @returns {DepositPlanReject} */
const reject = (reason) => ({ status: "reject", reason });

/** @param {FetchedRow | null | undefined} row */
const isMissing = (row) => row === null || row === undefined;

/** @param {string} owner */
const isUnsupportedProgram = (owner) => owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM;

/** @param {string} owner @param {string} [requiredProgram] */
const isWrongProgram = (owner, requiredProgram) =>
  requiredProgram !== undefined && owner !== requiredProgram;

/** @param {FetchedRow} row */
const hasExtensions = (row) =>
  row.owner === TOKEN_2022_PROGRAM && row.bytes.length > BASE_MINT_SIZE;

/**
 * One mint row guard.
 * @param {FetchedRow | null | undefined} row @param {string} label @param {string} [requiredProgram]
 * @returns {DepositPlanReject | null}
 */
export const guardMintRow = (row, label, requiredProgram) => {
  if (isMissing(row)) return reject(`the ${label} mint account is missing`);
  const mint = /** @type {FetchedRow} */ (row);
  if (isUnsupportedProgram(mint.owner)) {
    return reject(`the ${label} mint is not on a supported token program`);
  }
  if (isWrongProgram(mint.owner, requiredProgram)) {
    return reject(`the ${label} mint does not belong to the reserve's declared token program`);
  }
  if (hasExtensions(mint)) {
    return reject(`the ${label} mint carries token extensions the deposit path does not support`);
  }
  return null;
};

/**
 * The plain-supply constraint for a decoded obligation: the signer's own, vanilla-tagged,
 * borrow-free obligation in the configured market — never borrowing or leverage.
 * @param {ObligationState} state @param {{ owner: string; market: string }} intent
 * @returns {DepositPlanReject | null}
 */
/** @param {DecodedObligation} state @param {{ owner: string; market: string }} intent */
const plainSupplyRejection = (state, intent) => {
  if (state.owner !== intent.owner) {
    return reject(
      "the obligation at the signer's plain-supply address belongs to a different owner",
    );
  }
  if (state.lendingMarket !== intent.market) {
    return reject(
      "the obligation at the signer's plain-supply address belongs to a different market",
    );
  }
  if (state.tag !== 0) {
    return reject(
      "the obligation at the signer's plain-supply address is not a plain supply obligation",
    );
  }
  if (state.borrows.length > 0) {
    return reject(
      "the obligation already carries borrows; only plain supply obligations are supported",
    );
  }
  return null;
};

/**
 * Guard the obligation row when present: decode it and enforce the plain-supply constraint.
 * A kLend-owned row whose bytes do not decode as an obligation (the seam yields no state)
 * is rejected, never dereferenced.
 * @param {FetchedRow | null | undefined} row @param {{ owner: string; market: string }} intent
 * @returns {{ readonly state: ObligationState } | DepositPlanReject}
 */
export const guardObligationRow = (row, intent) => {
  if (isMissing(row)) return { state: undefined };
  if (row.owner !== KLEND_PROGRAM_ID) {
    return reject(
      "the account at the signer's plain-supply obligation address is not owned by the pinned lending program",
    );
  }
  const state = /** @type {FetchedRow} */ (row).state;
  if (state === undefined) {
    return reject(
      "the account at the signer's plain-supply obligation address does not decode as a Kamino obligation",
    );
  }
  const rejection = plainSupplyRejection(state, intent);
  return rejection ?? { state };
};

/**
 * Guard the source token account: present, owned by the signer, holding the deposit mint,
 * with at least the requested balance in base units.
 * @param {FetchedRow | null | undefined} row @param {string} sourceAta @param {{ owner: string; mint: string; amount: bigint }} intent
 * @returns {{ readonly source: { owner: string; mint: string; amount: string } } | DepositPlanReject}
 */
export const guardSourceRow = (row, sourceAta, intent) => {
  if (isMissing(row)) {
    return reject(`the source token account ${sourceAta} does not exist; fund or create it first`);
  }
  const source = /** @type {{ owner: string; mint: string; amount: string }} */ (
    /** @type {any} */ (tokenDecoder.decode(row.bytes))
  );
  if (source.owner !== intent.owner) {
    return reject("the source token account belongs to a different owner");
  }
  if (source.mint !== intent.mint) {
    return reject("the source token account holds a different mint than the deposit");
  }
  if (BigInt(source.amount) < intent.amount) {
    return reject(
      `insufficient token balance: ${source.amount} available, the deposit needs ${intent.amount}`,
    );
  }
  return { source };
};
