// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"InsufficientFunds", InsufficientFundsProps>} InsufficientFundsClass */
/** @typedef {{ readonly owner: string; readonly required: string; readonly available: string }} InsufficientFundsProps */
/** Checked before any executor is involved, so the failure is cheap and explicit. */
export class InsufficientFunds extends /** @type {InsufficientFundsClass} */ (
  taggedError("InsufficientFunds")
) {}
