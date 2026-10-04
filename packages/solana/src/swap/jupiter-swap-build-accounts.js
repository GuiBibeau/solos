// @ts-check
import { echoRejection, minOutRejection } from "./jupiter-swap-build-intent.js";
import { routeAccountsRejection } from "./jupiter-swap-build-route-accounts.js";
import { setupBindingRejection } from "./jupiter-swap-build-setup.js";
import { swapDataRejection } from "./jupiter-swap-build-swapdata.js";
import { programRejection, signerRejection } from "./jupiter-swap-build-validate.js";

/**
 * The full pre-sign build rejection: intent echo, minimum output, program and instruction
 * forms, the decoded swap payload, signer allowlist, setup and cleanup ownership bindings, and
 * recipient accounts. Undefined means the build is acceptable. Pure validation — nothing
 * signs, sends, or dials.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos-sh/actions").SwapAction} action
 * @param {string} taker
 * @returns {Promise<string | undefined>}
 */
export const buildRejection = async (envelope, action, taker) =>
  echoRejection(envelope, action) ??
  minOutRejection(envelope) ??
  programRejection(envelope) ??
  swapDataRejection(envelope.swapInstruction, action, envelope) ??
  signerRejection(envelope, taker) ??
  (await setupBindingRejection(envelope, action, taker)) ??
  (await routeAccountsRejection(envelope.swapInstruction, action, taker));
