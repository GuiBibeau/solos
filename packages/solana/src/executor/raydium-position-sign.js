// @ts-check
/**
 * Sign one assembled Raydium position instruction under the local v1 policy.
 *
 * Shared by opening and closing. Kit collects signers from the message's own account metas, so an
 * ephemeral NFT mint signs because its meta carries the signer — there is no second list of keys
 * to keep in step with the accounts.
 */
import {
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { RAYDIUM_V1_CONFIG } from "./raydium-liquidity-build.js";
import { beginV1Message, rejectionAfterV1Policy, signV1Message } from "./transaction-v1.js";

/**
 * @param {{ ctx: import("../rpc/solana-rpc.js").SolanaRpcShape;
 *   kit: import("../signer/kit-signer.js").KitSignerShape; instructions: any[] }} parts
 */
export const signRaydiumPosition = ({ ctx, kit, instructions }) =>
  Effect.gen(function* () {
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const message = setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      beginV1Message({ feePayerSigner: kit.signer, config: RAYDIUM_V1_CONFIG }),
    );
    return yield* Effect.tryPromise({
      try: () =>
        signV1Message(
          appendTransactionMessageInstructions(/** @type {any} */ (instructions), message),
        ),
      catch: (/** @type {unknown} */ error) => rejectionAfterV1Policy(error),
    });
  });
