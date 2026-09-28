// @ts-check
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { chainReader, lendDraft } from "./kamino-deposit-build.js";
import { depositFacts } from "./kamino-deposit-facts.js";
import { withdrawPlan } from "./kamino-withdraw-plan.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */

/**
 * Resolve the intent against the configured market and read-time position, and draft the
 * withdrawal. A rejection never simulates or sends; Submission seals and simulates the exact
 * bytes it would send, not a quote.
 * @param {{ ctx: Rpc; kit: Kit; market: string }} deps
 * @param {import("@solos/actions").WithdrawLendAction} action
 */
export const draftLendWithdraw = ({ ctx, kit, market }, action) =>
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
    return { draft: lendDraft("Kamino withdraw", plan.instructions), plan };
  }).pipe(Effect.withSpan("executor.buildLendWithdraw"));
