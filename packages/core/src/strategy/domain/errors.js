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
