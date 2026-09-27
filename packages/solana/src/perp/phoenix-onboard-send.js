// @ts-check
import {
  address,
  assertIsTransactionWithBlockhashLifetime,
  getBase58Decoder,
  signature,
} from "@solana/kit";
import { BuildRejected, RpcError, TransactionFailed } from "@solos/core";
import { Clock, Effect } from "effect";
import { simulationErrorText } from "../executor/simulation-error-text.js";
import { RPC_REQUEST_FAILED, rpcCall } from "../rpc/rpc-call.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { confirmDelivery } from "../submission/confirm.js";
import { SLOW } from "../submission/mode.js";
import { rpcStatus } from "../submission/submitter.js";
import { buildOnboarding } from "./phoenix-onboard-build.js";
import { submitEnrollment } from "./phoenix-onboard-submit.js";
import { assertPhoenixV0WireForSubmission } from "./phoenix-onboard-v0.js";

/** @typedef {{config: import("./phoenix-api.js").PhoenixConfig,ctx: import("../rpc/solana-rpc.js").SolanaRpcShape,kit: import("../signer/kit-signer.js").KitSignerShape,submission?: import("../submission/submission.js").SubmissionDeps}} Deps */
/** @typedef {import("@solos/actions").Action} Action */

/** @typedef {import("effect").Effect.Effect.Success<ReturnType<typeof import("./phoenix-onboard-build.js").buildOnboarding>>} Plan */
/** @param {Plan} planned */
const ownerSignature = (planned) => {
  const bytes = planned.signed.signatures[planned.owner];
  if (!bytes) throw new BuildRejected({ reason: "wallet did not sign Phoenix enrollment" });
  return signature(getBase58Decoder().decode(bytes));
};

/** @param {bigint | undefined} post @param {bigint} balance @param {unknown} error */
const estimateSpend = (post, balance, error) => {
  if (error !== null) return Effect.succeed(null);
  if (post === undefined || post > balance)
    return Effect.fail(
      new BuildRejected({
        reason: "Phoenix enrollment wallet spend could not be estimated; nothing was submitted",
      }),
    );
  return Effect.succeed((balance - post + 10_000n).toString());
};

/** @param {Deps} deps @param {Plan} planned */
const preflight = (deps, planned) =>
  Effect.gen(function* () {
    assertPhoenixV0WireForSubmission(planned.wire);
    assertIsTransactionWithBlockhashLifetime(planned.signed);
    const height = yield* rpcCall("getBlockHeight", deps.ctx.url, () =>
      deps.ctx.rpc.getBlockHeight({ commitment: "confirmed" }).send(),
    );
    if (height > planned.signed.lifetimeConstraint.lastValidBlockHeight) {
      return yield* new BuildRejected({
        reason: "Phoenix enrollment transaction expired before submission",
      });
    }
    const { value: balance } = yield* rpcCall("getBalance", deps.ctx.url, () =>
      deps.ctx.rpc.getBalance(address(planned.owner), { commitment: "confirmed" }).send(),
    );
    const { value } = yield* rpcCall("simulateTransaction", deps.ctx.url, () =>
      deps.ctx.rpc
        .simulateTransaction(planned.wire, {
          encoding: "base64",
          sigVerify: false,
          accounts: { addresses: [address(planned.owner)], encoding: "base64" },
        })
        .send(),
    );
    const estimatedSpendLamports = yield* estimateSpend(
      value.accounts?.[0]?.lamports,
      balance,
      value.err,
    );
    return {
      err: value.err,
      logs: [...(value.logs ?? [])],
      unitsConsumed: (value.unitsConsumed ?? 0n).toString(),
      estimatedSpendLamports,
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
      venueQuote:
        raw.estimatedSpendLamports === null
          ? null
          : {
              kind: /** @type {const} */ ("perp_onboard"),
              estimatedSpendLamports: raw.estimatedSpendLamports,
            },
      violations: isOk ? [] : [{ rule: "simulation", message: simulationErrorText(raw.err) }],
    };
  });

/**
 * Phoenix co-signs and submits enrollment itself, so its endpoint is this transaction's
 * Submitter (ADR-0031); status still comes from the operator's own RPC. A refusal Phoenix
 * reports is final; any other failure is resolved by the confirmation loop's lookup.
 * @param {Deps} deps @param {Plan} planned @param {import("@solana/kit").Signature} signature
 * @returns {import("../submission/submitter.js").SubmitterShape}
 */
const phoenixCosigner = (deps, planned, signature) => ({
  name: "phoenix-cosign",
  send: () =>
    Effect.tryPromise({
      try: () => submitEnrollment(deps.config, planned, signature),
      catch: (error) =>
        error instanceof TransactionFailed
          ? error
          : new RpcError({
              method: "send-register-ixs",
              url: rpcOrigin(deps.config.baseUrl),
              reason: RPC_REQUEST_FAILED,
            }),
    }),
  status: (sig) => rpcStatus(deps.ctx, sig),
});

/**
 * The configured Submission mode's confirmation, `slow` without one; Phoenix's own confirm
 * deadline, when set, still bounds the wait for its co-signed send.
 * @param {Deps} deps
 */
const confirmationFor = (deps) => {
  const confirmation = deps.submission?.mode.confirmation ?? SLOW.confirmation;
  const deadlineMs = deps.config.confirmDeadlineMs ?? confirmation.deadlineMs;
  return { ...confirmation, deadlineMs };
};

/** @param {Deps} deps @param {Plan} planned @param {import("@solana/kit").Signature} signature */
const confirmEnrollment = (deps, planned, signature) =>
  confirmDelivery(
    phoenixCosigner(deps, planned, signature),
    {
      wire: /** @type {import("@solana/kit").Base64EncodedWireTransaction} */ (planned.wire),
      signature,
      lastValidBlockHeight: /** @type {{ lastValidBlockHeight: bigint }} */ (
        planned.signed.lifetimeConstraint
      ).lastValidBlockHeight,
    },
    confirmationFor(deps),
  );

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
