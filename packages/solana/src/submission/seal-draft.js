// @ts-check
/**
 * Sealing, the first step of Submission (ADR-0032): a venue's draft becomes a signed v1
 * transaction. Submission fetches the lifetime, proves it still has the mode's headroom before
 * any signer is involved, builds the message through the one v1 constructor, and signs with the
 * fee payer plus whatever signers the draft's instructions carry on their accounts. Nothing here
 * adds, drops or reorders an instruction.
 */
import {
  appendTransactionMessageInstructions,
  pipe,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { BuildRejected, SignerUnavailable } from "@solos/core";
import { Effect } from "effect";
import { beginV1Message, signV1Message } from "../executor/transaction-v1.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { seal } from "./sealed.js";

export const EXPIRED_BEFORE_SIGNING =
  "the configured RPC lifetime expired before signing; nothing was signed or sent";
/**
 * What a failure inside the signing call is called. Assembly happened in the venue builder, and
 * a v1 policy breach arrives as a `BuildRejected` with its clause, so what is left is the
 * signing call itself. The text is fixed because a remote signer's exception can embed a raw
 * provider response body.
 */
export const SIGNER_FAILED =
  "signing failed after the v1 policy passed; no clause refused it and nothing was sent";

/**
 * @typedef {{
 *   readonly label: string;
 *   readonly instructions: ReadonlyArray<import("@solana/kit").Instruction>;
 *   readonly config: import("@solana/kit").V1TransactionConfig;
 * }} Draft
 * @typedef {{
 *   readonly ctx: import("../rpc/solana-rpc.js").SolanaRpcShape;
 *   readonly kit: import("../signer/kit-signer.js").KitSignerShape;
 *   readonly mode: import("./mode.js").SubmissionMode;
 * }} SealDeps
 */

/** @param {number} blocks */
const tooLittleBeforeSigning = (blocks) =>
  `the configured RPC lifetime had fewer than ${blocks} blocks left before signing; nothing was signed or sent`;

/**
 * @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx
 * @param {import("./mode.js").SubmissionMode["lifetime"]} rules
 */
const freshLifetime = (ctx, rules) =>
  Effect.gen(function* () {
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: rules.commitment }).send(),
    );
    if (!rules.recheck) return lifetime;
    const height = yield* rpcCall("getBlockHeight", ctx.url, () =>
      ctx.rpc.getBlockHeight({ commitment: rules.commitment }).send(),
    );
    if (height + BigInt(rules.minBlocksRemaining) <= lifetime.lastValidBlockHeight) return lifetime;
    const reason =
      height > lifetime.lastValidBlockHeight
        ? EXPIRED_BEFORE_SIGNING
        : tooLittleBeforeSigning(rules.minBlocksRemaining);
    return yield* new BuildRejected({ reason });
  });

/**
 * A policy breach keeps its clause; anything else happened inside the signer.
 * @param {import("../signer/kit-signer.js").KitSignerShape} kit
 * @param {import("@solana/kit").BlockhashLifetimeConstraint} lifetime
 * @param {Draft} draft
 */
const signDraft = (kit, lifetime, draft) =>
  Effect.tryPromise({
    try: async () =>
      signV1Message(
        pipe(
          beginV1Message({ feePayerSigner: kit.signer, config: draft.config }),
          (message) => setTransactionMessageLifetimeUsingBlockhash(lifetime, message),
          (message) =>
            appendTransactionMessageInstructions(
              /** @type {import("@solana/kit").Instruction[]} */ ([...draft.instructions]),
              message,
            ),
        ),
      ),
    catch: (error) =>
      error instanceof BuildRejected
        ? error
        : new SignerUnavailable({ backend: kit.backend, reason: SIGNER_FAILED }),
  });

/**
 * @param {SealDeps} deps
 * @param {Draft} draft
 * @returns {Effect.Effect<import("./sealed.js").Sealed, import("@solos/core").ExecutorError>}
 */
export const sealDraft = (deps, draft) =>
  Effect.gen(function* () {
    const lifetime = yield* freshLifetime(deps.ctx, deps.mode.lifetime);
    const signed = yield* signDraft(deps.kit, lifetime, draft);
    return yield* seal(signed);
  }).pipe(Effect.withSpan("submission.seal", { attributes: { label: draft.label } }));
