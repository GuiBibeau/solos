// @ts-check
import { ROUTE_LAYOUT_SLOTS } from "./jupiter-swap-build-route-accounts.js";
import { swapRouteLayout } from "./jupiter-swap-build-swapdata.js";
import { ATA_PROGRAM } from "./jupiter-swap-build-validate.js";

/**
 * Binding of the route and setup token programs to each requested mint's discovered on-chain
 * owner, checked during the read-only preflight. A crafted build can consistently rewrite the
 * route program, the ATA create, and the derived account to the other token program for a
 * classic-owned mint: every static check passes because the derived account matches, while the
 * route cannot operate on that mint under the selected program and fails only on-chain —
 * burning a fee under an explicit simulation skip. The discovered mint owner is the truth the
 * provider must echo; anything else is refused before signing.
 */

/** @typedef {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} Envelope */
/** @typedef {import("@solos/actions").SwapAction} SwapAction */
/** @typedef {Record<string, string>} MintOwners Discovered mint account owner per requested mint. */

const SOURCE_OWNER_REASON = "route source program did not match the input mint's on-chain owner";
const DESTINATION_OWNER_REASON =
  "route destination program did not match the output mint's on-chain owner";
const ATA_OWNER_REASON = "setup ATA create did not bind the mint's on-chain token program";
const UNSUPPORTED_LAYOUT_REASON =
  "mint owner binding cannot verify an unsupported Jupiter route layout";

/**
 * @param {import("./jupiter-swap-build-response.js").RawInstruction} swap
 * @param {SwapAction} action @param {MintOwners} owners
 */
const routeProgramRejection = (swap, action, owners) => {
  const layout = swapRouteLayout(swap);
  const slots = layout === undefined ? undefined : ROUTE_LAYOUT_SLOTS[layout];
  if (!slots) return UNSUPPORTED_LAYOUT_REASON;
  /** @param {number} slot */
  const program = (slot) => swap.accounts[slot]?.pubkey;
  if (program(slots.sourceProgram) !== owners[action.inputMint]) return SOURCE_OWNER_REASON;
  if (program(slots.destinationProgram) !== owners[action.outputMint]) {
    return DESTINATION_OWNER_REASON;
  }
  return undefined;
};

/** @param {string | undefined} mint @param {MintOwners} owners */
const discoveredOwner = (mint, owners) => (mint === undefined ? undefined : owners[mint]);

/** @param {import("./jupiter-swap-build-response.js").RawInstruction} ix @param {MintOwners} owners */
const ataCreateRejection = (ix, owners) => {
  const mint = ix.accounts[3]?.pubkey;
  return ix.accounts[5]?.pubkey === discoveredOwner(mint, owners) ? undefined : ATA_OWNER_REASON;
};

/** Every ATA create must ride the token program that owns its mint on chain. */
/** @param {Envelope} envelope @param {MintOwners} owners */
const ataCreatesRejection = (envelope, owners) => {
  for (const ix of envelope.setupInstructions) {
    if (ix.programId !== ATA_PROGRAM) continue;
    const rejection = ataCreateRejection(ix, owners);
    if (rejection) return rejection;
  }
  return undefined;
};

/**
 * Refuse any build whose route or setup token programs disagree with the discovered owner of a
 * requested mint. Undefined means the build may proceed to signing.
 * @param {Envelope} envelope @param {SwapAction} action @param {MintOwners} owners
 */
export const ownerBindingRejection = (envelope, action, owners) =>
  routeProgramRejection(envelope.swapInstruction, action, owners) ??
  ataCreatesRejection(envelope, owners);
