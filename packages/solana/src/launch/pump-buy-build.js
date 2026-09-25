// @ts-check
/**
 * Assemble and sign one pump.fun buy under the local v1 policy. Nothing here can send.
 *
 * The buy opens the buyer's token account and, on a first buy, their volume accumulator, so the
 * compute budget allows for those initialisations. The policy values are solOS's own, never the
 * provider's.
 */
import {
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { beginV1Message, signV1Message } from "../executor/transaction-v1.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { planPumpBuy } from "./pump-buy-plan.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */

/** Local v1 policy for a buy: room for the account initialisations the instruction performs. */
export const PUMP_BUY_V1_CONFIG = Object.freeze({
  computeUnitLimit: 300_000,
  loadedAccountsDataSizeLimit: 33_554_432,
  priorityFeeLamports: 100_000n,
});

const LIFETIME_EXPIRED = "the pump buy lifetime expired before signing; nothing was signed";

/**
 * @param {{ ctx: Rpc; kit: Kit }} deps
 * @param {import("@solos/actions").SwapAction} action
 */
export const buildSignedPumpBuy = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    const plan = yield* planPumpBuy(ctx, action, kit.signer);
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const height = yield* rpcCall("getBlockHeight", ctx.url, () =>
      ctx.rpc.getBlockHeight({ commitment: "confirmed" }).send(),
    );
    if (height > lifetime.lastValidBlockHeight) {
      return yield* new BuildRejected({ reason: LIFETIME_EXPIRED });
    }
    const message = setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      beginV1Message({ feePayerSigner: kit.signer, config: PUMP_BUY_V1_CONFIG }),
    );
    const signed = yield* Effect.tryPromise({
      try: () =>
        signV1Message(
          /** @type {any} */ (
            appendTransactionMessageInstructions(/** @type {any} */ (plan.instructions), message)
          ),
        ),
      catch: (/** @type {unknown} */ error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({
              reason: "transaction failed v1 policy before signing; nothing was signed",
            }),
    });
    return { signed, quote: plan.quote };
  }).pipe(Effect.withSpan("executor.buildPumpBuy"));
