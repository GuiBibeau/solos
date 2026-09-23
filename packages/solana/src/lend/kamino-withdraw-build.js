// @ts-check
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { chainReader, signLendInstructions } from "./kamino-deposit-build.js";
import { depositFacts } from "./kamino-deposit-facts.js";
import { withdrawPlan } from "./kamino-withdraw-plan.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */

/**
 * Resolve signed intent against the configured market and read-time position before signing.
 * A rejection never simulates or sends. The executor simulates the signed bytes, not a quote.
 * @param {{ ctx: Rpc; kit: Kit; market: string }} deps
 * @param {import("@solos/actions").WithdrawLendAction} action
 */
export const buildSignedLendWithdraw = ({ ctx, kit, market }, action) =>
  Effect.gen(function* () {
    if (action.protocol !== "kamino" || action.market !== market) {
      return yield* new BuildRejected({
        reason: "withdrawal market or protocol differs from executor configuration",
      });
    }
    const intent = {
      market,
      mint: action.mint,
      amount: BigInt(action.amount),
      owner: kit.signer.address,
    };
    const facts = yield* depositFacts({ rpc: ctx.rpc, url: ctx.url }, intent);
    const plan = yield* withdrawPlan({
      reader: chainReader(ctx),
      intent,
      facts,
      signer: kit.signer,
    });
    if (plan.status === "reject") return yield* new BuildRejected({ reason: plan.reason });
    const signed = yield* signLendInstructions({ ctx, kit, instructions: plan.instructions });
    return { signed, plan };
  }).pipe(Effect.withSpan("executor.buildLendWithdraw"));
