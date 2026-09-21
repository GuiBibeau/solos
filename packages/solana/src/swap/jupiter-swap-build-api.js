// @ts-check
import { SWAP_V2_BUILD_PATH, jupiterGet } from "./jupiter-swap-api.js";

/**
 * @typedef {import("./jupiter-swap-api.js").JupiterSwapConfig} JupiterSwapConfig
 * @typedef {import("./jupiter-swap-api.js").JupiterSwapOutcome} JupiterSwapOutcome
 */

/**
 * Parameters for one self-managed build request. `taker` is the configured signer's public
 * address — never a separate payer: the provider must not control who pays.
 * @typedef {{
 *   readonly inputMint: string;
 *   readonly outputMint: string;
 *   readonly amount: string;
 *   readonly slippageBps: number;
 *   readonly taker: string;
 * }} SwapBuildParams
 */

/**
 * The documented V2 build query: the exact intent plus the taker. `payer` is never sent (it
 * defaults to the taker, and a provider-chosen payer is banned) and `tipAmount` is never sent
 * (auto tips are banned) — validation rejects any build that carries a tip instruction.
 * @param {SwapBuildParams} params
 */
export const buildQuery = (params) => ({
  inputMint: params.inputMint,
  outputMint: params.outputMint,
  amount: params.amount,
  slippageBps: String(params.slippageBps),
  taker: params.taker,
});

/**
 * One build GET to the swap/v2/build endpoint through the shared transport: one deadline over
 * every hop and the body, hop-by-hop same-origin redirects, single attempt, no retry.
 * @param {JupiterSwapConfig} config
 * @param {SwapBuildParams} params
 * @returns {Promise<JupiterSwapOutcome>}
 */
export const jupiterSwapBuild = (config, params) =>
  jupiterGet(config, SWAP_V2_BUILD_PATH, buildQuery(params));
