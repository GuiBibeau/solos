// @ts-check
import { lamportsToSol } from "../../shared/domain/lamports.js";
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"InsufficientFunds", InsufficientFundsProps>} InsufficientFundsClass */
/** @typedef {{ readonly owner: string; readonly required: string; readonly available: string; readonly reason?: string }} InsufficientFundsProps */
/** Checked before any executor is involved, so the failure is cheap and explicit. */
export class InsufficientFunds extends /** @type {InsufficientFundsClass} */ (
  taggedError("InsufficientFunds")
) {
  /** @param {InsufficientFundsProps} props */
  constructor(props) {
    super({
      ...props,
      reason:
        props.reason ??
        `insufficient SOL: the transfer needs ${lamportsToSol(BigInt(props.required))} SOL and the wallet holds ${lamportsToSol(BigInt(props.available))} SOL`,
      remedy: "fund the wallet, or lower the transfer amount",
    });
  }
}
