// @ts-check
/**
 * Read live curve state and turn one sell intent into an instruction, or refuse it.
 *
 * The gates are the buy's — a live, SOL-quoted, pump-owned curve carrying its creator, and a
 * Global long enough to carry the live fee rates — so `validateBuyReads` is shared rather than
 * restated. What differs is the direction of the quote and one extra check the buy does not
 * need: the wallet must actually hold what it is selling.
 */
import { address } from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { bondingCurveAddress } from "./bonding-curve.js";
import { globalConfigAddress } from "./global-config.js";
import { associatedAccount, sellAccounts } from "./pump-buy-accounts.js";
import { encodeSellV2 } from "./pump-buy-instruction.js";
import { PUMP_BUY_REJECTIONS, accountAt, roleOf, validateBuyReads } from "./pump-buy-plan.js";
import { quoteSell } from "./pump-buy-quote.js";
import { PUMP_PROGRAM } from "./pump-program.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */

const BALANCE_TOO_LOW = "the wallet holds less of this coin than the sell asks for";
const PROCEEDS_TOO_SMALL = "the amount returns no lamports after fees and slippage";

/**
 * What the wallet holds of the coin, in base units. An absent token account is zero, not an
 * error: the wallet simply never held it, and the balance gate reports that plainly.
 * @param {Rpc} ctx @param {string} tokenAccount
 */
const heldTokens = (ctx, tokenAccount) =>
  rpcCall("getTokenAccountBalance", ctx.url, () =>
    ctx.rpc.getTokenAccountBalance(address(tokenAccount)).send(),
  ).pipe(
    Effect.map(({ value }) => BigInt(value.amount)),
    Effect.catchAll(() => Effect.succeed(0n)),
  );

/**
 * The three account reads the gates need, plus the two PDAs they were read from. One round
 * trip's worth of latency rather than three, exactly as the buy does it.
 * @param {Rpc} ctx @param {string} mint
 */
const sellReads = (ctx, mint) =>
  Effect.gen(function* () {
    const [curveKey, globalKey] = yield* Effect.promise(() =>
      Promise.all([bondingCurveAddress(mint), globalConfigAddress()]),
    );
    const [curve, global, mintAccount] = yield* Effect.all(
      [accountAt(ctx, curveKey), accountAt(ctx, globalKey), accountAt(ctx, mint)],
      { concurrency: 3 },
    );
    return { curveKey, globalKey, checked: validateBuyReads({ curve, global, mint: mintAccount }) };
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
 * @param {import("@solos/actions").SwapAction} action
 * @param {import("../signer/kit-signer.js").KitCompatibleSigner} signer
 */
export const planPumpSell = (ctx, action, signer) =>
  Effect.gen(function* () {
    const mint = action.inputMint;
    const user = signer.address;
    const { curveKey, globalKey, checked } = yield* sellReads(ctx, mint);
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
});
