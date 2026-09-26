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
import { UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { beginV1Message, rejectionAfterV1Policy, signV1Message } from "./transaction-v1.js";

/** Local v1 policy for a Raydium liquidity instruction: room for two tick arrays and the ATAs. */
export const RAYDIUM_V1_CONFIG = Object.freeze({
  computeUnitLimit: 400_000,
  loadedAccountsDataSizeLimit: 33_554_432,
  priorityFeeLamports: 100_000n,
});

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

/**
 * Raydium is the only venue whose position lifecycle this encodes. The use cases gate on the
 * same list, but an Action can reach the executor from anywhere, and routing an orca open into
 * a Raydium build would report a venue the transaction never touched.
 * @param {string} actionType @param {string} protocol
 */
export const notRaydium = (actionType, protocol) =>
  Effect.fail(
    new UnsupportedAction({ actionType: `${actionType}:${protocol}`, executor: "direct-signer" }),
  );
