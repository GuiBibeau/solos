// @ts-check
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { buildRejection } from "../swap/jupiter-swap-build-accounts.js";
import { swapDraft } from "../swap/jupiter-swap-build-assemble.js";

export const SWAP_AMOUNT_U64_MAX = 18_446_744_073_709_551_615n;
const AMOUNT_BOUND_REASON = "swap amount exceeded the u64 bound the executor can assemble";
const AMOUNT_POSITIVE_REASON = "swap amount must be a positive integer base-unit string";
const IDENTICAL_MINTS_REASON = "swap inputMint and outputMint must differ";
const VALIDATION_GUARD_REASON =
  "build validation could not be completed; nothing was signed or sent";
const ASSEMBLY_GUARD_REASON = "build could not be assembled; nothing was signed or sent";

/**
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("../swap/jupiter-swap-build-live.js").JupiterSwapBuildShape} Build
 * @typedef {import("@solos/actions").SwapAction} SwapAction
 * @typedef {import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope} JupiterBuildEnvelope
 */

/** @param {SwapAction} action */
const amountBoundRejection = (action) => {
  if (!/^\d+$/.test(action.amount) || BigInt(action.amount) === 0n) {
    return AMOUNT_POSITIVE_REASON;
  }
  if (BigInt(action.amount) > SWAP_AMOUNT_U64_MAX) {
    return AMOUNT_BOUND_REASON;
  }
  return undefined;
};

/** @param {SwapAction} action */
const intentRejection = (action) => {
  if (action.inputMint === action.outputMint) return IDENTICAL_MINTS_REASON;
  return amountBoundRejection(action);
};

/**
 * Fetch the provider build and hold it to the semantic rejection chain. Validator crashes on
 * malformed artifacts become fixed-reason rejections, never Effect defects or provider text.
 * @param {{ kit: Kit; build: Build }} deps @param {SwapAction} action
 */
export const fetchValidatedBuild = ({ kit, build }, action) =>
  Effect.gen(function* () {
    const overBound = intentRejection(action);
    if (overBound) return yield* new BuildRejected({ reason: overBound });
    const envelope = yield* build.build({
      inputMint: action.inputMint,
      outputMint: action.outputMint,
      amount: action.amount,
      slippageBps: action.maxSlippageBps,
      taker: kit.signer.address,
    });
    const rejection = yield* Effect.tryPromise({
      try: () => buildRejection(envelope, action, kit.signer.address),
      catch: () => new BuildRejected({ reason: VALIDATION_GUARD_REASON }),
    });
    if (rejection) return yield* new BuildRejected({ reason: rejection });
    return envelope;
  });

/**
 * Assemble the validated envelope into its draft. Submission seals it (ADR-0032): the v1
 * boundary and its ceilings are proved there, before any signer is involved.
 * @param {{ kit: Kit; tempWsolExisted?: boolean }} deps
 * @param {JupiterBuildEnvelope} envelope
 * @returns {import("effect").Effect.Effect<import("../submission/seal-draft.js").Draft, BuildRejected>}
 */
export const assembleDraft = ({ kit, tempWsolExisted = false }, envelope) =>
  Effect.tryPromise({
    try: () => swapDraft(envelope, kit.signer, { tempWsolExisted }),
    catch: () => new BuildRejected({ reason: ASSEMBLY_GUARD_REASON }),
  });
