// @ts-check
import { WSOL_MINT } from "@solos/actions";
import { UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { draftPumpBuy, draftPumpSell } from "../launch/pump-buy-build.js";
import { preflightSwapBuild } from "./swap-preflight.js";
import { assembleDraft, fetchValidatedBuild } from "./swap-sol-build.js";
import { minSolCredit, spendBoundProbe } from "./swap-spend-bound.js";

const EXECUTOR = "direct-signer";

export { SWAP_AMOUNT_U64_MAX } from "./swap-sol-build.js";

/**
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("../swap/jupiter-swap-build-live.js").JupiterSwapBuildShape} Build
 * @typedef {import("@solos/actions").SwapAction} SwapAction
 * @typedef {import("../swap/jupiter-swap-build-response.js").JupiterBuildEnvelope} JupiterBuildEnvelope
 * @typedef {import("../submission/seal-draft.js").Draft} Draft
 */

/** @typedef {{ readonly draft: Draft; readonly envelope: JupiterBuildEnvelope | undefined }} DraftedSwap */

/**
 * Fetch, validate and assemble one swap into its draft; Submission seals it (ADR-0032).
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
 * @returns {import("effect").Effect.Effect<DraftedSwap, import("@solos/core").ExecutorError>}
 */
export const draftSwap = ({ ctx, kit, build }, action) =>
  Effect.gen(function* () {
    if (action.venue === "pump") {
      const trade = action.inputMint === WSOL_MINT ? draftPumpBuy : draftPumpSell;
      const { draft } = yield* trade({ ctx, kit }, action);
      return { draft, envelope: undefined };
    }
    if (action.venue !== undefined && action.venue !== "jupiter") {
      return yield* new UnsupportedAction({
        actionType: `swap:${action.venue}`,
        executor: EXECUTOR,
      });
    }
    const envelope = yield* fetchValidatedBuild({ kit, build }, action);
    const { tempWsolExisted } = yield* preflightSwapBuild(ctx, {
      envelope,
      action,
      taker: kit.signer.address,
    });
    const draft = yield* assembleDraft({ kit, tempWsolExisted }, envelope);
    return { draft, envelope };
  });

/**
 * Plan one swap for Submission. The envelope's minimum output becomes the spend bound's
 * `credit`: it is what the bound requires back when the output is SOL, and discarding it would
 * let a route debit what it is about to credit and net out to a pass (ADR-0024). The bound runs
 * as the simulation probe, in both tiers, on the exact bytes that would be sent.
 * @param {{ ctx: Rpc; kit: Kit; build: Build }} deps @param {SwapAction} action
 */
export const plannedSwap = (deps, action) =>
  Effect.map(draftSwap(deps, action), (planned) => ({
    draft: planned.draft,
    venueQuote: /** @type {null} */ (null),
    probe: spendBoundProbe(deps.ctx, {
      taker: deps.kit.signer.address,
      action,
      credit: minSolCredit(planned.envelope, action),
    }),
  }));
