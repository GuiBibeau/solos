// @ts-check
import { UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { simulateClose, executeClose } from "../perp/phoenix-close-send.js";
import { simulateCollateral, executeCollateral } from "../perp/phoenix-collateral-send.js";
import { simulateEnrollment, executeEnrollment } from "../perp/phoenix-onboard-send.js";
import { simulateOpen, executeOpen } from "../perp/phoenix-open-send.js";

/** @typedef {{config:import("../perp/phoenix-api.js").PhoenixConfig;ctx:import("../rpc/solana-rpc.js").SolanaRpcShape;kit:import("../signer/kit-signer.js").KitSignerShape}} Deps */
/** @typedef {import("@solos/actions").Action} Action */

/** @param {Deps} deps @param {Action} action */
export const simulatePerpAction = (deps, action) => {
  if (action.type === "onboard_perp") return simulateEnrollment(deps, action);
  if (action.type === "deposit_perp_collateral" || action.type === "withdraw_perp_collateral")
    return simulateCollateral(deps, action);
  if (action.type === "open_perp") return simulateOpen(deps, action);
  if (action.type === "close_perp") return simulateClose(deps, action);
  return Effect.fail(new UnsupportedAction({ actionType: action.type, executor: "direct-signer" }));
};

/** @param {Deps} deps @param {Action} action @param {{skipSimulation:boolean}} options */
export const executePerpAction = (deps, action, options) => {
  if (action.type === "onboard_perp") return executeEnrollment(deps, action);
  if (action.type === "deposit_perp_collateral" || action.type === "withdraw_perp_collateral")
    return executeCollateral(deps, action);
  if (action.type === "open_perp") return executeOpen(deps, action, options);
  if (action.type === "close_perp") return executeClose(deps, action, options);
  return Effect.fail(new UnsupportedAction({ actionType: action.type, executor: "direct-signer" }));
};
