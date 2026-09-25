// @ts-check
/**
 * Turn one buy intent into an instruction, or refuse it.
 *
 * The gates and the fee schedule are `pump-read-gates.js`, shared with the sell. What is here is
 * the buy's own arithmetic and its account initialisation.
 */
import { address } from "@solana/kit";
import { getCreateAssociatedTokenIdempotentInstruction } from "@solana-program/token";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { bondingCurveAddress } from "./bonding-curve.js";
import { globalConfigAddress } from "./global-config.js";
import { buyAccounts, feeConfigAddress } from "./pump-buy-accounts.js";
import { encodeBuyExactQuoteInV2 } from "./pump-buy-instruction.js";
import { quoteBuy } from "./pump-buy-quote.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { PUMP_BUY_REJECTIONS, accountAt, roleOf, validateTradeReads } from "./pump-read-gates.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("@solos/actions").SwapAction} SwapAction */

export { PUMP_BUY_REJECTIONS, accountAt, dataBytes, roleOf } from "./pump-read-gates.js";
export { validateTradeReads as validateBuyReads } from "./pump-read-gates.js";

/**
 * The four accounts every pump trade prices against, and the two PDAs they were read from.
 * The fee config is one of them: the program reads its tier table to charge the trade, so a
 * quote that does not read it is pricing against a schedule Pump retired (see `fee-config.js`).
 * One round trip's worth of latency rather than four.
 * @param {Rpc} ctx @param {string} mint
 */
export const tradeReads = (ctx, mint) =>
  Effect.gen(function* () {
    const [curveKey, globalKey, feeKey] = yield* Effect.promise(() =>
      Promise.all([bondingCurveAddress(mint), globalConfigAddress(), feeConfigAddress()]),
    );
    const [curve, global, mintAccount, feeConfig] = yield* Effect.all(
      [
        accountAt(ctx, curveKey),
        accountAt(ctx, globalKey),
        accountAt(ctx, mint),
        accountAt(ctx, feeKey),
      ],
      { concurrency: 4 },
    );
    return {
      curveKey,
      globalKey,
      checked: validateTradeReads({ curve, global, mint: mintAccount, feeConfig }),
    };
  });

/**
 * The positional instruction: the IDL's account order and the encoded args.
 *
 * `buy_exact_quote_in_v2` does not open the buyer's token account — unlike `buy_v2`, it carries
 * no `init_if_needed`, and a first buy fails on chain with `AccountNotInitialized` for
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
    const { curveKey, globalKey, checked } = yield* tradeReads(ctx, mint);
    if (!checked.ok) return yield* new BuildRejected({ reason: checked.reason });

    const quote = quoteBuy(checked.layout, {
      budgetLamports: BigInt(action.amount),
      totalFeeBps: checked.totalFeeBps,
      slippageBps: action.maxSlippageBps,
    });
    // A budget too small to clear one token after fees would hand the program a zero floor,
    // which is no protection at all.
    if (quote.minTokensOut <= 0n) {
      return yield* new BuildRejected({ reason: PUMP_BUY_REJECTIONS.BUDGET_TOO_SMALL });
    }

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
    const instructions = yield* Effect.promise(() =>
      buyInstructions({
        accounts,
        spendableSolIn: BigInt(action.amount),
        minTokensOut: quote.minTokensOut,
        signer,
      }),
    );
    return { quote, instructions };
  }).pipe(Effect.withSpan("launch.planPumpBuy"));
