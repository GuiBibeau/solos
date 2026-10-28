// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"StrategyTransitionRefused", StrategyTransitionRefusedProps>} StrategyTransitionRefusedClass */
/** @typedef {{ readonly id: string; readonly from: string; readonly to: string; readonly reason?: string }} StrategyTransitionRefusedProps */
/** A Caller asked for a lifecycle move the state table does not allow. */
export class StrategyTransitionRefused extends /** @type {StrategyTransitionRefusedClass} */ (
  taggedError("StrategyTransitionRefused")
) {
  /** @param {StrategyTransitionRefusedProps} props */
  constructor(props) {
    super({
      ...props,
      reason: props.reason ?? `cannot move strategy ${props.id} from ${props.from} to ${props.to}`,
      remedy: "done, expired, and failed are terminal; register a new strategy instead",
    });
  }
}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"StrategyNotFound", StrategyNotFoundProps>} StrategyNotFoundClass */
/** @typedef {{ readonly id: string; readonly reason?: string }} StrategyNotFoundProps */
/** No Strategy with this id is registered. */
export class StrategyNotFound extends /** @type {StrategyNotFoundClass} */ (
  taggedError("StrategyNotFound")
) {
  /** @param {StrategyNotFoundProps} props */
  constructor(props) {
    super({
      ...props,
      reason: props.reason ?? `no strategy ${props.id}`,
      remedy: "list strategies and use an id from that list",
    });
  }
}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"KillSwitchEngaged", KillSwitchEngagedProps>} KillSwitchEngagedClass */
/** @typedef {{ readonly scope: string; readonly reason?: string }} KillSwitchEngagedProps */
/** The per-Strategy switch or the global switch is engaged, so a new reserve is refused. */
export class KillSwitchEngaged extends /** @type {KillSwitchEngagedClass} */ (
  taggedError("KillSwitchEngaged")
) {
  /** @param {KillSwitchEngagedProps} props */
  constructor(props) {
    super({
      ...props,
      reason: props.reason ?? `kill switch is engaged for ${props.scope}`,
      remedy: "disengage the kill switch before reserving",
    });
  }
}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"StrategyInvalid", StrategyInvalidProps>} StrategyInvalidClass */
/** @typedef {{ readonly reason: string }} StrategyInvalidProps */
/** The document is not a Strategy this Registry can store. */
export class StrategyInvalid extends /** @type {StrategyInvalidClass} */ (
  taggedError("StrategyInvalid")
) {
  /** @param {StrategyInvalidProps} props */
  constructor(props) {
    super({
      ...props,
      remedy: "fix the strategy document so it matches the strategy schema",
    });
  }
}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"UnsupportedStrategyAction", UnsupportedStrategyActionProps>} UnsupportedStrategyActionClass */
/** @typedef {{ readonly type?: string; readonly reason?: string }} UnsupportedStrategyActionProps */
/** A schedule or trigger action is not one of the kinds a tick can reserve. */
export class UnsupportedStrategyAction extends /** @type {UnsupportedStrategyActionClass} */ (
  taggedError("UnsupportedStrategyAction")
) {
  /** @param {UnsupportedStrategyActionProps} props */
  constructor(props) {
    super({
      ...props,
      reason: props.reason ?? `scheduled action ${props.type ?? "unknown"} is not supported`,
      remedy: "use transfer_sol, swap, or a meteora liquidity action",
    });
  }
}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"MintDecimalsUnverified", MintDecimalsUnverifiedProps>} MintDecimalsUnverifiedClass */
/** @typedef {{ readonly mint?: string; readonly reason?: string }} MintDecimalsUnverifiedProps */
/** The mint account's decimals could not be read, so a reserve must not price the amount. */
export class MintDecimalsUnverified extends /** @type {MintDecimalsUnverifiedClass} */ (
  taggedError("MintDecimalsUnverified")
) {
  /** @param {MintDecimalsUnverifiedProps} props */
  constructor(props) {
    super({
      ...props,
      reason: props.reason ?? `mint decimals could not be verified for ${props.mint ?? "unknown"}`,
      remedy: "retry when the mint account can be read as an initialized mint",
    });
  }
}
