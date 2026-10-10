// @ts-check
import { taggedError } from "./tagged-error.js";

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"RpcError", RpcErrorProps>} RpcErrorClass */
/** @typedef {{ readonly method: string; readonly url: string; readonly reason: string }} RpcErrorProps */
/** The RPC endpoint failed or returned an error. Shared because every slice talks to RPC. */
export class RpcError extends /** @type {RpcErrorClass} */ (taggedError("RpcError")) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"SignerUnavailable", SignerUnavailableProps>} SignerUnavailableClass */
/** @typedef {{ readonly backend: string; readonly reason: string }} SignerUnavailableProps */
/** The configured signer cannot sign right now (missing key, remote backend down). */
export class SignerUnavailable extends /** @type {SignerUnavailableClass} */ (
  taggedError("SignerUnavailable")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"ValidationError", ValidationErrorProps>} ValidationErrorClass */
/** @typedef {{ readonly field: string; readonly value: unknown; readonly reason: string }} ValidationErrorProps */
/** Input rejected by a domain rule before any I/O happened. */
export class ValidationError extends /** @type {ValidationErrorClass} */ (
  taggedError("ValidationError")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"InternalError", InternalErrorProps>} InternalErrorClass */
/** @typedef {{ readonly operation: string; readonly reason: string }} InternalErrorProps */
/** A defect surfaced at a boundary. Never carries stack traces outward. */
export class InternalError extends /** @type {InternalErrorClass} */ (
  taggedError("InternalError")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"SimulationFailed", SimulationFailedProps>} SimulationFailedClass */
/** @typedef {{ readonly reason: string; readonly logs: ReadonlyArray<string> }} SimulationFailedProps */
/** The executor simulated the action and the transaction would fail. */
export class SimulationFailed extends /** @type {SimulationFailedClass} */ (
  taggedError("SimulationFailed")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"TransactionFailed", TransactionFailedProps>} TransactionFailedClass */
/** @typedef {{ readonly signature: string | null; readonly reason: string }} TransactionFailedProps */
/** The executor sent the transaction and it did not confirm. */
export class TransactionFailed extends /** @type {TransactionFailedClass} */ (
  taggedError("TransactionFailed")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"TransactionExpired", TransactionExpiredProps>} TransactionExpiredClass */
/** @typedef {{ readonly signature: string; readonly reason: string }} TransactionExpiredProps */
/** A signed transaction expired before submission. It was never sent. */
export class TransactionExpired extends /** @type {TransactionExpiredClass} */ (
  taggedError("TransactionExpired")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"UnsupportedAction", UnsupportedActionProps>} UnsupportedActionClass */
/** @typedef {{ readonly actionType: string; readonly executor: string; readonly reason?: string; readonly remedy?: string }} UnsupportedActionProps */
/** The configured executor has no implementation for this action type. */
export class UnsupportedAction extends /** @type {UnsupportedActionClass} */ (
  taggedError("UnsupportedAction")
) {
  /** @param {UnsupportedActionProps} props */
  constructor(props) {
    super({
      ...props,
      reason:
        props.reason ??
        `action ${props.actionType} has no implementation in the ${props.executor} executor`,
    });
  }
}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"BoundsExceeded", BoundsExceededProps>} BoundsExceededClass */
/**
 * `bound` is the limit that refused (`maxDailySpendUsd`, `allowedMints`, ...). `limit` and
 * `requested` are strings: a decimal cap and the amount asked, or the allowlist and the mint or
 * venue that fell outside it. `scope` is `engine`, or the strategy id when a strategy ceiling refused.
 * @typedef {{ readonly bound: string; readonly limit: string; readonly requested: string; readonly scope: string; readonly reason?: string }} BoundsExceededProps
 */
/**
 * An Action asked for more than Bounds allow. The sentence names the bound, its limit, what was
 * requested and which scope refused. The raise site supplies `remedy` when a next action exists.
 */
export class BoundsExceeded extends /** @type {BoundsExceededClass} */ (
  taggedError("BoundsExceeded")
) {
  /** @param {BoundsExceededProps & { readonly remedy?: string }} props */
  constructor(props) {
    super({ ...props, reason: props.reason ?? boundsExceededReason(props) });
  }
}

/** @param {BoundsExceededProps} props */
const boundsExceededReason = (props) => {
  const { bound, limit, requested, scope } = props;
  if (
    bound === undefined ||
    limit === undefined ||
    requested === undefined ||
    scope === undefined
  ) {
    return "the action exceeds a configured bound";
  }
  return `${bound} limit is ${limit} on scope ${scope}; requested ${requested}`;
};

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"BuildRejected", BuildRejectedProps>} BuildRejectedClass */
/** @typedef {{ readonly reason: string }} BuildRejectedProps */
/** A transaction failed policy before signing; validation may include read-only RPC preflight. */
export class BuildRejected extends /** @type {BuildRejectedClass} */ (
  taggedError("BuildRejected")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"BuildUnavailable", BuildUnavailableProps>} BuildUnavailableClass */
/** @typedef {{ readonly reason: string }} BuildUnavailableProps */
/** A provider build could not be obtained; no transaction was signed or sent. */
export class BuildUnavailable extends /** @type {BuildUnavailableClass} */ (
  taggedError("BuildUnavailable")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"SignerConfigMissing", SignerConfigMissingProps>} SignerConfigMissingClass */
/** @typedef {{ readonly reason: string }} SignerConfigMissingProps */
/** No signer is configured. Ordinary missing configuration, reported as a domain error, not a defect. */
export class SignerConfigMissing extends /** @type {SignerConfigMissingClass} */ (
  taggedError("SignerConfigMissing")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"RpcConfigMissing", RpcConfigMissingProps>} RpcConfigMissingClass */
/** @typedef {{ readonly reason: string }} RpcConfigMissingProps */
/** No RPC URL is configured, and there is no default. Ordinary missing configuration, not a defect. */
export class RpcConfigMissing extends /** @type {RpcConfigMissingClass} */ (
  taggedError("RpcConfigMissing")
) {}
