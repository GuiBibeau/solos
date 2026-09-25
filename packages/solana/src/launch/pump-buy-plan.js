// @ts-check
/**
 * Read live curve state and turn one buy intent into an instruction, or refuse it.
 *
 * Everything the quote depends on is read at plan time rather than assumed: the curve's
 * reserves, its creator (the vault PDA is seeded from it), its quote asset, and the protocol
 * and creator fee rates. The pinned documentation states `fee_basis_points == 100`; the live
 * account reads 95 with a separate 5 bps creator fee, so a constant here would misprice every
 * buy. The mint's token program is discovered the same way rather than presumed classic.
 */
import { address, getBase58Decoder } from "@solana/kit";
import { getCreateAssociatedTokenIdempotentInstruction } from "@solana-program/token";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { bondingCurveAddress, decodeBondingCurve, isSolQuote } from "./bonding-curve.js";
import { decodeGlobalConfig, globalConfigAddress } from "./global-config.js";
import { buyAccounts } from "./pump-buy-accounts.js";
import { encodeBuyExactQuoteInV2 } from "./pump-buy-instruction.js";
import { quoteBuy } from "./pump-buy-quote.js";
import { PUMP_PROGRAM } from "./pump-program.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("@solos/actions").SwapAction} SwapAction */

const b58 = getBase58Decoder();

/** @param {Rpc} ctx @param {string} key */
const accountAt = (ctx, key) =>
  rpcCall("getAccountInfo", ctx.url, () =>
    ctx.rpc.getAccountInfo(address(key), { encoding: "base64" }).send(),
  ).pipe(Effect.map(({ value }) => value));

/** @param {{ data: readonly string[] } | null} account */
const dataBytes = (account) =>
  account === null ? null : Uint8Array.from(Buffer.from(account.data[0] ?? "", "base64"));

/** @typedef {{ data: readonly string[]; owner: string } | null} RawAccount */

/** @param {string} reason */
const fail = (reason) => ({ ok: /** @type {const} */ (false), reason });

/** Account-level gates, before anything is decoded. @param {{ curve: RawAccount; global: RawAccount; mint: RawAccount }} reads */
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
  return undefined;
};

/** @param {ReturnType<typeof decodeGlobalConfig>} config */
const configRejection = (config) => {
  if (config.status !== "decoded") return GLOBAL_CORRUPT;
  // Every optional field the buy goes on to decode must be proven here. A Global carrying the
  // fee rates but shorter than the buyback array would otherwise reach `b58.decode(undefined)`
  // and escape as an untyped failure instead of a typed refusal.
  if (
    config.feeRecipient === undefined ||
    config.feeBasisPoints === undefined ||
    config.buybackFeeRecipient === undefined
  ) {
    return GLOBAL_NO_FEES;
  }
  return undefined;
};

/**
 * Everything the quote needs, or the fixed reason the buy is refused. Pure: the three account
 * reads happen once in the caller and every gate the contract asks for is decided here, so the
 * refusals are testable without a chain.
 * @param {{ curve: RawAccount; global: RawAccount; mint: RawAccount }} reads
 */
export const validateBuyReads = (reads) => {
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
  return {
    ok: /** @type {const} */ (true),
    layout,
    creator: b58.decode(/** @type {Uint8Array} */ (layout.creator)),
    feeRecipient: b58.decode(decoded.feeRecipient),
    buybackFeeRecipient: b58.decode(decoded.buybackFeeRecipient),
    totalFeeBps: decoded.feeBasisPoints + (layout.creatorFeeBps ?? 0n),
    tokenProgram: /** @type {{ owner: string }} */ (reads.mint).owner,
  };
};

/**
 * The positional instruction: the IDL's account order and the encoded args.
 *
 * `buy_exact_sol_in` does not open the buyer's token account — unlike `buy_v2`, it carries no
 * `init_if_needed`, and a first buy fails on chain with `AccountNotInitialized` for
 * `associated_user`. An idempotent create is prepended: the one account initialisation the buy
 * requires, and a no-op on every later buy.
 * @param {{
 *   accounts: Parameters<typeof buyAccounts>[0];
 *   spendableSolIn: bigint;
 *   minTokensOut: bigint;
 *   signer: import("../signer/kit-signer.js").KitCompatibleSigner;
 * }} parts
 */
const buyInstructions = async ({ accounts, spendableSolIn, minTokensOut, signer }) => {
  const metas = await buyAccounts(accounts);
  // v2 index 14 is `associated_base_user`; the IDL marks no init_if_needed on it.
  const buyerTokenAccount = metas[14];
  return [
    getCreateAssociatedTokenIdempotentInstruction({
      payer: signer,
      ata: address(/** @type {{ address: string }} */ (buyerTokenAccount).address),
      owner: address(accounts.user),
      mint: address(accounts.mint),
      tokenProgram: address(accounts.baseTokenProgram),
    }),
    {
      programAddress: address(PUMP_PROGRAM),
      accounts: metas.map((account) => ({
        address: address(account.address),
        role: roleOf(account),
      })),
      data: encodeBuyExactQuoteInV2({ spendableQuoteIn: spendableSolIn, minTokensOut }),
    },
  ];
};

/**
 * @param {Rpc} ctx
 * @param {SwapAction} action
 * @param {import("../signer/kit-signer.js").KitCompatibleSigner} signer
 */
export const planPumpBuy = (ctx, action, signer) =>
  Effect.gen(function* () {
    const mint = action.outputMint;
    const user = signer.address;
    const [curveKey, globalKey] = yield* Effect.promise(() =>
      Promise.all([bondingCurveAddress(mint), globalConfigAddress()]),
    );
    // Three independent reads; one round trip's worth of latency rather than three.
    const [curve, global, mintAccount] = yield* Effect.all(
      [accountAt(ctx, curveKey), accountAt(ctx, globalKey), accountAt(ctx, mint)],
      { concurrency: 3 },
    );
    const checked = validateBuyReads({ curve, global, mint: mintAccount });
    if (!checked.ok) return yield* new BuildRejected({ reason: checked.reason });

    const quote = quoteBuy(checked.layout, {
      budgetLamports: BigInt(action.amount),
      totalFeeBps: checked.totalFeeBps,
      slippageBps: action.maxSlippageBps,
    });
    // A budget too small to clear one token after fees would hand the program a zero floor,
    // which is no protection at all.
    if (quote.minTokensOut <= 0n) return yield* new BuildRejected({ reason: BUDGET_TOO_SMALL });

    const accounts = {
      mint,
      user,
      creator: checked.creator,
      feeRecipient: checked.feeRecipient,
      buybackFeeRecipient: checked.buybackFeeRecipient,
      bondingCurve: curveKey,
      global: globalKey,
      baseTokenProgram: checked.tokenProgram,
    };
    const spendableSolIn = BigInt(action.amount);
    const instructions = yield* Effect.promise(() =>
      buyInstructions({ accounts, spendableSolIn, minTokensOut: quote.minTokensOut, signer }),
    );
    return {
      quote,
      instructions,
    };
  }).pipe(Effect.withSpan("launch.planPumpBuy"));

/** Kit's AccountRole numbering: writable and signer are independent bits. */
/** @param {{ writable: boolean; signer: boolean }} account */
const roleOf = ({ writable, signer }) => (writable ? 1 : 0) + (signer ? 2 : 0);

const CURVE_ABSENT = "no pump bonding curve exists for this mint; nothing was signed or sent";
const CURVE_MISOWNED = "the curve account is not owned by the pinned pump program";
const CURVE_CORRUPT = "the curve account is not a readable bonding curve";
const CURVE_COMPLETE =
  "the bonding curve has completed and no longer trades; the buy is never rerouted";
const NOT_SOL_QUOTED = "the curve trades against a quote asset other than SOL";
const CREATOR_ABSENT = "the curve predates the creator field the buy's vault is seeded from";
const MINT_ABSENT = "the requested mint was not found on chain";
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
  GLOBAL_CORRUPT,
  GLOBAL_NO_FEES,
  BUDGET_TOO_SMALL,
});
