// @ts-check
import { ActionExecutor, UnsupportedAction } from "@solos/core";
import { Effect, Layer } from "effect";
import { KAMINO_MAIN_MARKET } from "../lend/kamino-addresses.js";
import { draftLendDeposit, lendQuoteOf } from "../lend/kamino-deposit-build.js";
import { draftLendWithdraw } from "../lend/kamino-withdraw-build.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { KitSigner } from "../signer/kit-signer.js";
import { SLOW, SubmissionModeSchema } from "../submission/mode.js";
import { simulateDraft, submitDraft } from "../submission/submission.js";
import { Submitter } from "../submission/submitter.js";
import { JupiterSwapBuild } from "../swap/jupiter-swap-build-live.js";
import { draftTokenAccountClose } from "../wallet/close-token-account-build.js";
import { executionResult, simulationResult } from "./action-results.js";
import { depositQuoteOf, draftLiquidityDeposit } from "./liquidity-deposit-build.js";
import { draftLiquidityWithdraw, withdrawQuoteOf } from "./liquidity-withdraw-build.js";
import { simulatePerpAction, executePerpAction } from "./perp-dispatch.js";
import { plannedClose, plannedOpen } from "./position-lifecycle-dispatch.js";
import { plannedSwap } from "./swap-sol.js";
import { transferDraft } from "./transfer-sol.js";

export const EXECUTOR_NAME = "direct-signer";
const PERP_ACTIONS = new Set([
  "onboard_perp",
  "open_perp",
  "close_perp",
  "deposit_perp_collateral",
  "withdraw_perp_collateral",
]);

/**
 * @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("../swap/jupiter-swap-build-live.js").JupiterSwapBuildShape} Build
 * @typedef {import("@solos-sh/actions").Action} Action
 */

/**
 * @typedef {{
 *   ctx: Rpc; kit: Kit; build: Build; market: string;
 *   phoenix: import("../perp/phoenix-api.js").PhoenixConfig;
 *   submission: import("../submission/submission.js").SubmissionDeps;
 * }} Deps
 */
/** @typedef {import("../submission/seal-draft.js").Draft} Draft */

/**
 * Everything `plannedDraft` does not quote: one draft, or `UnsupportedAction` so callers learn
 * the gap instead of guessing.
 * @param {{ ctx: Rpc; kit: Kit }} deps
 * @param {Action} action
 * @returns {import("effect").Effect.Effect<Draft, import("@solos/core").ExecutorError>}
 */
const build = ({ ctx, kit }, action) => {
  if (action.type === "transfer_sol") return Effect.sync(() => transferDraft(kit, action));
  if (action.type === "close_position") return plannedClose({ ctx, kit }, action);
  return Effect.fail(new UnsupportedAction({ actionType: action.type, executor: EXECUTOR_NAME }));
};

/**
 * Keep the plan's venueQuote alongside the draft.
 * @template P
 * @param {import("effect").Effect.Effect<{ draft: Draft; plan: P }, import("@solos/core").ExecutorError>} planned
 * @param {(plan: P) => import("@solos-sh/actions").VenueQuote} toQuote
 */
const quoted = (planned, toQuote) =>
  Effect.map(planned, ({ draft, plan }) => ({ draft, venueQuote: toQuote(plan) }));

/**
 * Draft, keeping the plan's venueQuote for the venue branches: their quoted amounts and encoded
 * bounds are what the caller records (ADR-0022 QA reconciliation). Submission seals the draft.
 * @param {Deps} deps
 * @param {Action} action
 * @returns {import("effect").Effect.Effect<{ draft: Draft; venueQuote: import("@solos-sh/actions").VenueQuote | null; probe?: import("../submission/simulate.js").Probe; position?: string }, import("@solos/core").ExecutorError>}
 */
const plannedDraft = ({ ctx, kit, build: buildSwap, market }, action) => {
  switch (action.type) {
    case "remove_liquidity": {
      return quoted(draftLiquidityWithdraw({ ctx, kit }, action), withdrawQuoteOf);
    }
    case "add_liquidity": {
      return quoted(draftLiquidityDeposit({ ctx, kit }, action), depositQuoteOf);
    }
    case "open_position": {
      return plannedOpen({ ctx, kit }, action);
    }
    case "lend": {
      return quoted(draftLendDeposit({ ctx, kit, market }, action), (plan) =>
        lendQuoteOf(plan.quote),
      );
    }
    case "withdraw_lend": {
      return quoted(draftLendWithdraw({ ctx, kit, market }, action), (plan) => plan.quote);
    }
    case "swap": {
      return plannedSwap({ ctx, kit, build: buildSwap }, action);
    }
    case "close_token_account": {
      return quoted(draftTokenAccountClose({ ctx, kit }, action), (plan) => plan.quote);
    }
    default: {
      return Effect.map(build({ ctx, kit }, action), (draft) => ({ draft, venueQuote: null }));
    }
  }
};

/** @param {Deps} deps */
const perpDeps = ({ phoenix, ctx, kit, submission }) => ({ config: phoenix, ctx, kit, submission });

/**
 * @param {Deps} deps
 * @param {Action} action
 * @returns {import("effect").Effect.Effect<import("@solos-sh/actions").SimulationResult, import("@solos/core").ExecutorError>}
 */
const simulate = (deps, action) =>
  Effect.gen(function* () {
    if (PERP_ACTIONS.has(action.type)) return yield* simulatePerpAction(perpDeps(deps), action);
    const planned = yield* plannedDraft(deps, action);
    const simulated = yield* simulateDraft(deps.submission, planned);
    return simulationResult(action, simulated, planned.venueQuote);
  });

/**
 * @param {Deps} deps
 * @param {Action} action
 * @param {{ readonly skipSimulation: boolean }} options
 * @returns {import("effect").Effect.Effect<import("@solos-sh/actions").ExecutionResult, import("@solos/core").ExecutorError>}
 */
const execute = (deps, action, options) =>
  Effect.gen(function* () {
    if (PERP_ACTIONS.has(action.type))
      return yield* executePerpAction(perpDeps(deps), action, options);
    const planned = yield* plannedDraft(deps, action);
    const delivered = yield* submitDraft(deps.submission, planned, options);
    const confirmed = yield* executionResult(action, delivered);
    return planned.position === undefined
      ? confirmed
      : { ...confirmed, position: planned.position };
  });

/**
 * The default executor: the configured keypair signs and sends directly (ADR-0013).
 * Right for wallet mode, paper mode on Surfpool, and dev. A vault engine is a different Layer.
 * The configured Kamino market (ADR-0019) rides along so `lend` actions are revalidated
 * against the exact market the reads advertise.
 * Every venue's draft goes through Submission (ADR-0031, ADR-0032), which seals it with the
 * configured signer under the configured mode (`slow` unless composition passes another) and
 * delivers it through whichever Submitter is provided. A passed mode is validated against the
 * one schema here, so a bad preset fails at composition rather than on the first send.
 * @param {{
 *   readonly market?: string;
 *   readonly phoenix?: import("../perp/phoenix-api.js").PhoenixConfig;
 *   readonly submission?: import("../submission/mode.js").SubmissionMode;
 * }} [config]
 */
export const DirectSignerExecutor = (config) => {
  const mode =
    config?.submission === undefined ? SLOW : SubmissionModeSchema.parse(config.submission);
  return Layer.effect(
    ActionExecutor,
    Effect.all([SolanaRpc, KitSigner, JupiterSwapBuild, Submitter]).pipe(
      Effect.map(([ctx, kit, build, submitter]) => {
        const deps = {
          ctx,
          kit,
          build,
          market: config?.market ?? KAMINO_MAIN_MARKET,
          phoenix: config?.phoenix ?? { baseUrl: "https://perp-api.phoenix.trade" },
          submission: { ctx, kit, submitter, mode },
        };
        return {
          name: EXECUTOR_NAME,
          simulate: (action) => simulate(deps, action),
          execute: (action, options) => execute(deps, action, options),
        };
      }),
    ),
  );
};
