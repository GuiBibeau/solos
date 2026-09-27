// @ts-check
import { getBase64EncodedWireTransaction } from "@solana/kit";
import { WSOL_MINT } from "@solos/actions";
import { UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { buildSignedPumpBuy, buildSignedPumpSell } from "../launch/pump-buy-build.js";
import { preflightSwapBuild } from "./swap-preflight.js";
import { assembleAndSign, fetchValidatedBuild } from "./swap-sol-build.js";
import { minSolCredit } from "./swap-spend-bound.js";
import { assertV1WireForSubmission } from "./transaction-v1.js";

const EXECUTOR = "direct-signer";

export { SWAP_AMOUNT_U64_MAX } from "./swap-sol-build.js";

/**
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("../swap/jupiter-swap-build-live.js").JupiterSwapBuildShape} Build
 * @typedef {import("@solos/actions").SwapAction} SwapAction
 * @typedef {import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope} JupiterBuildEnvelope
 * @typedef {import("./swap-sol-build.js").Signed} Signed
 */

/** @typedef {{ readonly signed: Signed; readonly envelope: JupiterBuildEnvelope }} SignedSwap */

/**
 * Fetch, validate, assemble, and sign one swap.
 *
 * The venue comes from the Action and nothing else: a `pump` trade is built against the bonding
 * curve, and an ordinary swap of the same coin still goes to Jupiter. Neither is ever inferred
 * from a mint, and a failed build is never retried at the other venue. A pump trade carries no
 * Jupiter envelope, so callers reading one must tolerate its absence.
 *
 * Within the venue, which side holds wSOL is the direction: the Action contract already
 * guarantees exactly one side does, so wSOL in means buying the coin and wSOL out means selling
 * it. That is a reading of the validated Action, not an inference about a mint.
 * @param {{ ctx: Rpc; kit: Kit; build: Build }} deps @param {SwapAction} action
 */
export const buildSignedSwap = ({ ctx, kit, build }, action) =>
  Effect.gen(function* () {
    if (action.venue === "pump") {
      const trade = action.inputMint === WSOL_MINT ? buildSignedPumpBuy : buildSignedPumpSell;
      const { signed } = yield* trade({ ctx, kit }, action);
      return { signed, envelope: undefined };
    }
    if (action.venue !== undefined && action.venue !== "jupiter") {
      return yield* new UnsupportedAction({
        actionType: `swap:${action.venue}`,
        executor: EXECUTOR,
      });
    }
    const envelope = yield* fetchValidatedBuild({ kit, build }, action);
    const { lifetime, tempWsolExisted } = yield* preflightSwapBuild(ctx, {
      envelope,
      action,
      taker: kit.signer.address,
    });
    const signed = yield* assembleAndSign({ kit, lifetime, tempWsolExisted }, envelope);
    return { signed, envelope };
  });

/**
 * Plan one swap for the simulate tier. The envelope's minimum output is kept as `credit`: it is
 * what the spend bound requires back when the output is SOL, and discarding it would let a
 * route debit what it is about to credit and net out to a pass (ADR-0024).
 * @param {{ ctx: Rpc; kit: Kit; build: Build }} deps @param {SwapAction} action
 */
export const plannedSwap = (deps, action) =>
  Effect.map(buildSignedSwap(deps, action), (planned) => ({
    signed: planned.signed,
    venueQuote: /** @type {null} */ (null),
    credit: minSolCredit(planned.envelope, action),
  }));

/**
 * Prove the exact wire bytes about to touch RPC decode to a v1 message.
 * @param {Signed} signed
 * @returns {import("effect").Effect.Effect<unknown, import("@solos/core").BuildRejected>}
 */
export const assertSwapWireBeforeContact = (signed) =>
  Effect.try({
    try: () => assertV1WireForSubmission(getBase64EncodedWireTransaction(signed)),
    catch: (error) => /** @type {import("@solos/core").BuildRejected} */ (error),
  });
