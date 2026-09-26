// @ts-check
/**
 * Wrapping native SOL for a funding side, inside the transaction that spends it.
 *
 * Most Solana concentrated liquidity is SOL-paired, and a wallet holding native SOL held nothing
 * the venues could take: they take wSOL, an SPL token, and nothing here wrapped it. This closes
 * that gap without ever wrapping on its own initiative — the caller asks for it explicitly, and
 * the amount is the shortfall against the quote, never the whole budget.
 *
 * Everything happens in one transaction: create the account if it is absent, move exactly the
 * lamports the quote is short, sync it, spend it, and close it again. A failure anywhere fails
 * the whole transaction, so no state exists in which SOL sits wrapped because a deposit did not
 * land. The account is closed only when this transaction created it — a pre-existing wSOL
 * account belongs to the caller, and taking its rent is not this code's business.
 */
import { getTransferSolInstruction } from "@solana-program/system";
import {
  getCloseAccountInstruction,
  getSyncNativeInstruction,
  getTokenDecoder,
} from "@solana-program/token";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { createAta, liquidityRead } from "./liquidity-token-accounts.js";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

const tokenDecoder = getTokenDecoder();

/** Nothing to wrap: the common case, and the only one for a non-SOL side. */
const NOTHING = Object.freeze({ prefix: [], suffix: [], covered: 0n });

/** @param {string} value */
const asAddress = (value) =>
  /** @type {import("@solana/kit").Address} */ (/** @type {unknown} */ (value));

/**
 * @param {{ kit: import("../signer/kit-signer.js").KitSignerShape; ata: string;
 *   lamports: bigint; isAbsent: boolean }} wrap
 */
const wrapInstructions = ({ kit, ata, lamports, isAbsent }) => ({
  prefix: [
    ...(isAbsent ? [createAta(kit, WSOL_MINT, { ata })] : []),
    getTransferSolInstruction({
      source: kit.signer,
      destination: asAddress(ata),
      amount: lamports,
    }),
    getSyncNativeInstruction({ account: asAddress(ata) }),
  ],
  // Only an account this transaction created is closed again: unused lamports and the rent come
  // back as native SOL, and the wallet ends where it started.
  suffix: isAbsent
    ? [
        getCloseAccountInstruction({
          account: asAddress(ata),
          destination: asAddress(kit.signer.address),
          owner: kit.signer,
        }),
      ]
    : [],
  covered: lamports,
});

/**
 * What one funding side needs wrapped, if anything. `covered` is what the funding rule may then
 * count as held: the wrap lands in the same transaction, before the spend.
 * @param {{ ctx: import("../rpc/solana-rpc.js").SolanaRpcShape;
 *   kit: import("../signer/kit-signer.js").KitSignerShape;
 *   mint: string; ata: string; required: bigint; wrapSol: boolean }} side
 */
export const wrapPlan = ({ ctx, kit, mint, ata, required, wrapSol }) =>
  Effect.gen(function* () {
    if (!wrapSol || mint !== WSOL_MINT || required === 0n) return NOTHING;
    const [row] = yield* fetchAccounts(liquidityRead(ctx), [ata]);
    const isAbsent = row === null || row === undefined;
    const held = isAbsent ? 0n : tokenDecoder.decode(row.bytes).amount;
    if (held >= required) return NOTHING;
    return wrapInstructions({ kit, ata, lamports: required - held, isAbsent });
  });

/**
 * The wrap for whichever side of a two-sided plan is wSOL, or nothing. Only one side can be,
 * since a pool cannot pair a mint with itself.
 * @param {{ ctx: import("../rpc/solana-rpc.js").SolanaRpcShape;
 *   kit: import("../signer/kit-signer.js").KitSignerShape; wrapSol: boolean;
 *   sides: ReadonlyArray<{ mint: string; ata: string; required: bigint }> }} plan
 */
export const wrapForSides = ({ ctx, kit, wrapSol, sides }) =>
  Effect.gen(function* () {
    for (const side of sides) {
      const wrap = yield* wrapPlan({ ctx, kit, wrapSol, ...side });
      if (wrap.covered > 0n) return wrap;
    }
    return NOTHING;
  });
