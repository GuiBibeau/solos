// @ts-check
/**
 * Every gate a pump trade must pass, decided over the four account reads and nothing else.
 *
 * Pure: the reads happen once in the caller, so each refusal the contract names is provable
 * without a chain. Both directions share this — a buy and a sell refuse a completed,
 * foreign-owned, missing or non-SOL-quoted curve identically, and each adds only its own gates
 * on top.
 *
 * Nothing here is assumed from documentation. The curve's reserves, its creator (the vault PDA
 * is seeded from it), its quote asset, the mint's token program and the live fee schedule are
 * all read. The pinned docs state `fee_basis_points == 100`; the live account reads 95, and the
 * fee actually charged is neither (see `fee-config.js`).
 */
import { address, getBase58Decoder } from "@solana/kit";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { decodeBondingCurve, isSolQuote } from "./bonding-curve.js";
import { decodeFeeConfig, mintSupply, resolveFeeBps } from "./fee-config.js";
import { decodeGlobalConfig } from "./global-config.js";
import { PUMP_PROGRAM } from "./pump-program.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {{ data: readonly string[]; owner: string } | null} RawAccount */
/** @typedef {{ curve: RawAccount; global: RawAccount; mint: RawAccount; feeConfig: RawAccount }} Reads */

const b58 = getBase58Decoder();

/** @param {Rpc} ctx @param {string} key */
export const accountAt = (ctx, key) =>
  rpcCall("getAccountInfo", ctx.url, () =>
    ctx.rpc.getAccountInfo(address(key), { encoding: "base64" }).send(),
  ).pipe(Effect.map(({ value }) => value));

/**
 * An account's bytes, or null when there is no account. A missing key reads as absent rather
 * than dereferencing undefined: every gate below turns null into a typed refusal, and a
 * TypeError here would escape the slice as an untyped failure instead.
 * @param {{ data: readonly string[] } | null | undefined} account
 */
export const dataBytes = (account) =>
  account === null || account === undefined
    ? null
    : Uint8Array.from(Buffer.from(account.data[0] ?? "", "base64"));

/** @param {string} reason */
const fail = (reason) => ({ ok: /** @type {const} */ (false), reason });

/** Account-level gates, before anything is decoded. @param {Reads} reads */
const accountRejection = ({ curve, mint }) => {
  if (curve === null) return CURVE_ABSENT;
  if (curve.owner !== PUMP_PROGRAM) return CURVE_MISOWNED;
  if (mint === null) return MINT_ABSENT;
  return undefined;
};

/** Curve-level gates: a live, SOL-quoted curve carrying the creator its vault is seeded from. */
/** @param {ReturnType<typeof decodeBondingCurve>} curve */
const curveRejection = (curve) => {
  if (curve.status !== "decoded") return CURVE_CORRUPT;
  if (curve.layout.complete) return CURVE_COMPLETE;
  if (!isSolQuote(curve.layout.quoteMint)) return NOT_SOL_QUOTED;
  if (curve.layout.creator === undefined) return CREATOR_ABSENT;
  // Which fee recipient the program authorizes is selected by this flag, so a layout too short
  // to carry it cannot be priced — guessing either set aborts the transaction on chain.
  if (curve.layout.isMayhemMode === undefined) return MAYHEM_FLAG_ABSENT;
  return undefined;
};

/** @param {ReturnType<typeof decodeGlobalConfig>} config */
const configRejection = (config) => {
  if (config.status !== "decoded") return GLOBAL_CORRUPT;
  // Every optional field a trade goes on to decode must be proven here. A Global carrying the
  // fee rates but shorter than the buyback array would otherwise reach `b58.decode(undefined)`
  // and escape as an untyped failure instead of a typed refusal.
  if (
    config.feeRecipient === undefined ||
    config.mayhemFeeRecipient === undefined ||
    config.feeBasisPoints === undefined ||
    config.buybackFeeRecipient === undefined
  ) {
    return GLOBAL_NO_FEES;
  }
  return undefined;
};

/**
 * Everything the quote needs, or the fixed reason the trade is refused.
 * @param {Reads} reads
 */
export const validateTradeReads = (reads) => {
  const onAccounts = accountRejection(reads);
  if (onAccounts) return fail(onAccounts);
  const curve = decodeBondingCurve(dataBytes(reads.curve));
  const onCurve = curveRejection(curve);
  if (onCurve) return fail(onCurve);
  const config = decodeGlobalConfig(dataBytes(reads.global));
  const onConfig = configRejection(config);
  if (onConfig) return fail(onConfig);
  // Every optional field above was proven present by its gate.
  const layout = /** @type {import("./bonding-curve.js").BondingCurveLayout} */ (
    /** @type {any} */ (curve).layout
  );
  const decoded = /** @type {any} */ (config);
  const fees = resolveFeeBps({
    feeConfig: decodeFeeConfig(dataBytes(reads.feeConfig)),
    global: decoded,
    curve: layout,
    supply: mintSupply(dataBytes(reads.mint)),
  });
  if (!fees.ok) return fail(fees.reason);
  return {
    ok: /** @type {const} */ (true),
    layout,
    creator: b58.decode(/** @type {Uint8Array} */ (layout.creator)),
    feeRecipient: b58.decode(
      layout.isMayhemMode === true ? decoded.mayhemFeeRecipient : decoded.feeRecipient,
    ),
    buybackFeeRecipient: b58.decode(decoded.buybackFeeRecipient),
    totalFeeBps: fees.totalFeeBps,
    tokenProgram: /** @type {{ owner: string }} */ (reads.mint).owner,
  };
};

/** Kit's AccountRole numbering: writable and signer are independent bits. */
/** @param {{ writable: boolean; signer: boolean }} account */
export const roleOf = ({ writable, signer }) => (writable ? 1 : 0) + (signer ? 2 : 0);

const CURVE_ABSENT = "no pump bonding curve exists for this mint; nothing was signed or sent";
const CURVE_MISOWNED = "the curve account is not owned by the pinned pump program";
const CURVE_CORRUPT = "the curve account is not a readable bonding curve";
const CURVE_COMPLETE =
  "the bonding curve has completed and no longer trades; the buy is never rerouted";
const NOT_SOL_QUOTED = "the curve trades against a quote asset other than SOL";
const CREATOR_ABSENT = "the curve predates the creator field the buy's vault is seeded from";
const MINT_ABSENT = "the requested mint was not found on chain";
const MAYHEM_FLAG_ABSENT =
  "the curve predates the mayhem-mode flag that selects the authorized fee recipient";
const GLOBAL_CORRUPT = "the pump Global config is absent or unreadable";
const GLOBAL_NO_FEES = "the pump Global config is too short to carry the live fee rates";
const BUDGET_TOO_SMALL = "the budget buys no whole token after fees and slippage";

export const PUMP_BUY_REJECTIONS = Object.freeze({
  CURVE_ABSENT,
  CURVE_MISOWNED,
  CURVE_CORRUPT,
  CURVE_COMPLETE,
  NOT_SOL_QUOTED,
  CREATOR_ABSENT,
  MINT_ABSENT,
  MAYHEM_FLAG_ABSENT,
  GLOBAL_CORRUPT,
  GLOBAL_NO_FEES,
  BUDGET_TOO_SMALL,
  FEE_SCHEDULE_UNREADABLE: "the pump fee config is present but not a readable fee schedule",
  MINT_UNREADABLE: "the mint account is too short to carry a supply",
});
