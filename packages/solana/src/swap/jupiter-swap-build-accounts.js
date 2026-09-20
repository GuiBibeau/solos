// @ts-check
import { echoRejection, minOutRejection } from "./jupiter-swap-build-intent.js";
import { derivedAta, setupBindingRejection } from "./jupiter-swap-build-setup.js";
import { swapDataRejection } from "./jupiter-swap-build-swapdata.js";
import { programRejection, signerRejection } from "./jupiter-swap-build-validate.js";

/**
 * Recipient and account-matching checks for one Jupiter V2 build. The swap must move funds
 * between the taker's own derived associated token accounts: the source is the taker's ATA of
 * the input mint, the destination the taker's ATA of the output mint, and both mints must
 * appear as the route's market accounts. Setup and cleanup ownership bindings live in
 * jupiter-swap-build-setup.js, and the executable-byte binding of the swap payload in
 * jupiter-swap-build-swapdata.js. This is what makes "the intended accounts receive the
 * intended amounts" checkable before signing.
 */

/**
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action
 * @param {string} taker
 */
const accountsRejection = async (envelope, action, taker) => {
  const accounts = envelope.swapInstruction.accounts;
  const sourceAta = await derivedAta(taker, action.inputMint);
  const destinationAta = await derivedAta(taker, action.outputMint);
  if (accounts.every((a) => !(a.pubkey === sourceAta && a.isWritable))) {
    return "swap instruction did not spend the taker's source token account";
  }
  if (accounts.every((a) => !(a.pubkey === destinationAta && a.isWritable))) {
    return "swap instruction did not credit the taker's destination token account";
  }
  if (accounts.every((a) => !(a.pubkey === action.inputMint && a.isWritable))) {
    return "swap instruction did not carry the input mint's market account";
  }
  if (accounts.every((a) => !(a.pubkey === action.outputMint && a.isWritable))) {
    return "swap instruction did not carry the output mint's market account";
  }
  return undefined;
};

/**
 * The full pre-sign build rejection: intent echo, minimum output, program and instruction
 * forms, the decoded swap payload, signer allowlist, setup and cleanup ownership bindings, and
 * recipient accounts. Undefined means the build is acceptable. Pure validation — nothing
 * signs, sends, or dials.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action
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
  (await accountsRejection(envelope, action, taker));
