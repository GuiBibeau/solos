// @ts-check
import { ataCreateRejection, cleanupBindingRejection } from "./jupiter-swap-build-setup-account.js";
import { ATA_PROGRAM } from "./jupiter-swap-build-validate.js";
import { wrapRejection } from "./jupiter-swap-build-wrap.js";

export { derivedAta } from "./jupiter-swap-build-setup-account.js";

/**
 * The full ownership-binding rejection for setup and cleanup. Undefined means acceptable.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action @param {string} taker
 */
export const setupBindingRejection = async (envelope, action, taker) => {
  for (const ix of envelope.setupInstructions) {
    if (ix.programId !== ATA_PROGRAM) continue;
    const rejection = await ataCreateRejection(ix, action, taker);
    if (rejection) return rejection;
  }
  return (
    (await wrapRejection(envelope, action, taker)) ??
    (envelope.cleanupInstruction
      ? await cleanupBindingRejection(envelope, action, taker)
      : undefined)
  );
};
