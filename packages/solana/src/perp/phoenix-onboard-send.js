// @ts-check
import { assertIsTransactionWithBlockhashLifetime, getBase58Decoder, signature } from "@solana/kit";
import { BuildRejected, TransactionFailed } from "@solos/core";
import { Clock, Effect } from "effect";
import { simulationErrorText } from "../executor/simulation-error-text.js";
import { assertV1WireForSubmission } from "../executor/transaction-v1.js";
import { confirmationState, confirmSubmitted } from "../executor/transfer-confirm.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { RegisterSent, phoenixPost } from "./phoenix-onboard-api.js";
import { buildOnboarding } from "./phoenix-onboard-build.js";

/** @typedef {{config: import("./phoenix-api.js").PhoenixConfig,ctx: import("../rpc/solana-rpc.js").SolanaRpcShape,kit: import("../signer/kit-signer.js").KitSignerShape}} Deps */
/** @typedef {import("@solos/actions").Action} Action */

/** @typedef {import("effect").Effect.Effect.Success<ReturnType<typeof import("./phoenix-onboard-build.js").buildOnboarding>>} Plan */
/** @param {Plan} planned */
const ownerSignature = (planned) => {
  const bytes = planned.signed.signatures[planned.owner];
  if (!bytes) throw new BuildRejected({ reason: "wallet did not sign Phoenix enrollment" });
  return signature(getBase58Decoder().decode(bytes));
};

/** @param {Deps} deps @param {Plan} planned */
const preflight = (deps, planned) =>
  Effect.gen(function* () {
    assertV1WireForSubmission(planned.wire);
    assertIsTransactionWithBlockhashLifetime(planned.signed);
    const height = yield* rpcCall("getBlockHeight", deps.ctx.url, () =>
      deps.ctx.rpc.getBlockHeight({ commitment: "confirmed" }).send(),
    );
    if (height > planned.signed.lifetimeConstraint.lastValidBlockHeight) {
      return yield* new BuildRejected({
        reason: "Phoenix enrollment transaction expired before submission",
      });
    }
    const { value } = yield* rpcCall("simulateTransaction", deps.ctx.url, () =>
      deps.ctx.rpc
        .simulateTransaction(planned.wire, { encoding: "base64", sigVerify: false })
        .send(),
    );
    return {
      err: value.err,
      logs: [...(value.logs ?? [])],
      unitsConsumed: (value.unitsConsumed ?? 0n).toString(),
    };
  });

/** @param {Deps} deps @param {Action} action */
export const simulateEnrollment = (deps, action) =>
  Effect.gen(function* () {
    const planned = yield* buildOnboarding(deps.config, deps.ctx, deps.kit);
    const raw = yield* preflight(deps, planned);
    const isOk = raw.err === null;
    return {
      action,
      ok: isOk,
      unitsConsumed: raw.unitsConsumed,
      logs: raw.logs,
      projectedPortfolio: null,
      venueQuote: null,
      violations: isOk ? [] : [{ rule: "simulation", message: simulationErrorText(raw.err) }],
    };
  });

/** @param {Deps} deps @param {Plan} planned @param {import("@solana/kit").Signature} signature */
const confirmEnrollment = (deps, planned, signature) =>
  confirmSubmitted({
    signature,
    submit: async () => {
      const response = RegisterSent.parse(
        await phoenixPost(deps.config, "/v1/exchange/send-register-ixs", {
          transaction: planned.wire,
          traderAuthority: planned.owner,
          txFeePayer: planned.owner,
          maxPositions: 128,
          traderPdaIndex: 0,
          traderSubaccountIndex: 0,
        }),
      );
      if (
        response.signature !== signature ||
        response.traderPda !== planned.trader ||
        response.txFeePayer !== planned.owner
      ) {
        throw new TransactionFailed({
          signature,
          reason: "Phoenix enrollment response did not match the signed transaction",
        });
      }
    },
    lookup: async (abortSignal) => {
      const { value } = await deps.ctx.rpc
        .getSignatureStatuses([signature], { searchTransactionHistory: true })
        .send({ abortSignal });
      return confirmationState(value[0]);
    },
  });

/** The server co-signs, simulates, and submits the partially signed transaction. Simulate
 * identical locally signed bytes without signature verification (server signature pending).
 * @param {Deps} deps @param {Action} action
 */
export const executeEnrollment = (deps, action) =>
  Effect.gen(function* () {
    const planned = yield* buildOnboarding(deps.config, deps.ctx, deps.kit);
    const raw = yield* preflight(deps, planned);
    if (raw.err !== null)
      return yield* new BuildRejected({
        reason: "Phoenix enrollment simulation failed; nothing was submitted",
      });
    const signature = ownerSignature(planned);
    yield* confirmEnrollment(deps, planned, signature);
    return {
      action,
      status: /** @type {const} */ ("confirmed"),
      signature,
      executedAt: yield* Clock.currentTimeMillis,
      simulated: true,
      error: null,
    };
  });
