// @ts-check
import { FiberRef } from "effect";

/**
 * A sync record of the sealed transaction. Submission calls it after signing and before
 * broadcast, when the Engine has set it for the Intent being executed. Unset everywhere else.
 * @typedef {(sealed: import("./sealed.js").Sealed) => void} SignedNote
 */

/** @type {FiberRef.FiberRef<SignedNote | undefined>} */
export const signedIntentNote = FiberRef.unsafeMake(
  /** @type {SignedNote | undefined} */ (undefined),
);
