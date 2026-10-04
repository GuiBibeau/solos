// @ts-check
/**
 * Read live curve state and turn one sell intent into an instruction, or refuse it.
 *
 * The gates and the four account reads are the buy's — a live, SOL-quoted, pump-owned curve
 * carrying its creator, a Global long enough to carry the fee fields, and the fee program's live
 * tier table — so `tradeReads` is shared rather than restated. What differs is the direction of
 * the quote and one check the buy does not need: the wallet must hold what it is selling.
 */
import { address } from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { associatedAccount, sellAccounts } from "./pump-buy-accounts.js";
import { encodeSellV2 } from "./pump-buy-instruction.js";
import { PUMP_BUY_REJECTIONS, tradeReads } from "./pump-buy-plan.js";
import { quoteSell } from "./pump-buy-quote.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { accountAt, roleOf } from "./pump-read-gates.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */

const BALANCE_TOO_LOW = "the wallet holds less of this coin than the sell asks for";
const PROCEEDS_TOO_SMALL = "the amount returns no lamports after fees and slippage";
const NOT_A_TOKEN_ACCOUNT = "the seller's derived token account is not a readable token account";

/** `amount` sits at bytes 64..72 of the SPL token account layout, classic and Token-2022 alike. */
const TOKEN_AMOUNT_START = 64;
const TOKEN_AMOUNT_END = 72;

/**
 * What the wallet holds of the coin, in base units.
 *
 * Read with `getAccountInfo` rather than `getTokenAccountBalance` so that "no such account" is a
 * `null` value instead of an RPC error. A wallet that never held the coin must read as zero, but
 * a timeout, a rate limit or a malformed response must not: catching those and calling them zero
 * would answer an endpoint outage with `BALANCE_TOO_LOW`, telling the operator they hold nothing
 * when the truth is that nothing was learned. Here only an absent account is zero and every real
 * failure stays a structured `RpcError`.
 * @param {Rpc} ctx @param {string} tokenAccount
 * @returns {import("effect").Effect.Effect<bigint, import("@solos/core").RpcError | BuildRejected>}
 */
const heldTokens = (ctx, tokenAccount) =>
  Effect.gen(function* () {
    const account = yield* accountAt(ctx, tokenAccount);
    if (account === null) return 0n;
    const bytes = Uint8Array.from(Buffer.from(account.data[0] ?? "", "base64"));
    if (bytes.length < TOKEN_AMOUNT_END) {
      return yield* new BuildRejected({ reason: NOT_A_TOKEN_ACCOUNT });
    }
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(
      TOKEN_AMOUNT_START,
      true,
    );
  });

/**
 * The positional instruction. Nothing is prepended: unlike the buy, a sell cannot reach here
 * without the seller's token account already existing, because the balance gate read it.
 * @param {{
 *   accounts: Parameters<typeof sellAccounts>[0];
 *   tokensIn: bigint;
 *   minSolOutput: bigint;
 * }} parts
 */
const sellInstruction = async ({ accounts, tokensIn, minSolOutput }) => {
  const metas = await sellAccounts(accounts);
  return {
    programAddress: address(PUMP_PROGRAM),
    accounts: metas.map((meta) => ({ address: address(meta.address), role: roleOf(meta) })),
    data: encodeSellV2({ tokensIn, minSolOutput }),
  };
};

/**
 * @param {Rpc} ctx
 * @param {import("@solos-sh/actions").SwapAction} action
 * @param {import("../signer/kit-signer.js").KitCompatibleSigner} signer
 */
export const planPumpSell = (ctx, action, signer) =>
  Effect.gen(function* () {
    const mint = action.inputMint;
    const user = signer.address;
    const { curveKey, globalKey, checked } = yield* tradeReads(ctx, mint);
    if (!checked.ok) return yield* new BuildRejected({ reason: checked.reason });

    const tokensIn = BigInt(action.amount);
    const sellerAccount = yield* Effect.promise(() =>
      associatedAccount(user, mint, checked.tokenProgram),
    );
    const held = yield* heldTokens(ctx, sellerAccount);
    if (held < tokensIn) return yield* new BuildRejected({ reason: BALANCE_TOO_LOW });

    const quote = quoteSell(checked.layout, {
      tokensIn,
      totalFeeBps: checked.totalFeeBps,
      slippageBps: action.maxSlippageBps,
    });
    if (quote.minSolOutput <= 0n) return yield* new BuildRejected({ reason: PROCEEDS_TOO_SMALL });

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
    const instruction = yield* Effect.promise(() =>
      sellInstruction({ accounts, tokensIn, minSolOutput: quote.minSolOutput }),
    );
    return { quote, instructions: [instruction] };
  }).pipe(Effect.withSpan("launch.planPumpSell"));

export const PUMP_SELL_REJECTIONS = Object.freeze({
  ...PUMP_BUY_REJECTIONS,
  BALANCE_TOO_LOW,
  PROCEEDS_TOO_SMALL,
  NOT_A_TOKEN_ACCOUNT,
});
