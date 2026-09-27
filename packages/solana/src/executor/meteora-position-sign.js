// @ts-check
/**
 * Sign one Meteora position instruction under the local v1 policy.
 *
 * Opening admits a second signer: the ephemeral position key lives on its account meta, and Kit
 * collects it from there. The key is not stored, reused, or logged. Closing signs with the fee
 * payer alone.
 */
import {
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { beginV1Message, rejectionAfterV1Policy, signV1Message } from "./transaction-v1.js";

/** Same local budget as a Meteora deposit, and the pinned CLI's close compute limit. */
export const METEORA_POSITION_V1_CONFIG = Object.freeze({
  computeUnitLimit: 1_400_000,
  loadedAccountsDataSizeLimit: 33_554_432,
  priorityFeeLamports: 100_000n,
});

/**
 * @param {{ ctx: import("../rpc/solana-rpc.js").SolanaRpcShape;
 *   kit: import("../signer/kit-signer.js").KitSignerShape; instructions: readonly unknown[] }} parts
 */
export const signMeteoraPosition = ({ ctx, kit, instructions }) =>
  Effect.gen(function* () {
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const message = setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      beginV1Message({ feePayerSigner: kit.signer, config: METEORA_POSITION_V1_CONFIG }),
    );
    return yield* Effect.tryPromise({
      try: () =>
        signV1Message(
          appendTransactionMessageInstructions(/** @type {any} */ (instructions), message),
        ),
      catch: (/** @type {unknown} */ error) => rejectionAfterV1Policy(error),
    });
  });

/**
 * @param {string} actionType
 * @param {string} protocol
 */
export const notMeteora = (actionType, protocol) =>
  Effect.fail(
    new UnsupportedAction({
      actionType: `${actionType}:${protocol}`,
      executor: "direct-signer",
      remedy: `pass protocol meteora to ${actionType}`,
    }),
  );
