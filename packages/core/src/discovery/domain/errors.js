// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"ToolSelectorUnavailable", ToolSelectorUnavailableProps>} ToolSelectorUnavailableClass */
/** @typedef {{ readonly reason: string; readonly remedy?: string }} ToolSelectorUnavailableProps */
/**
 * The configured selector could not rank this request: no key, an error, or no answer in time.
 * Selection never surfaces it. It falls back to the local matcher and reports the reason.
 */
export class ToolSelectorUnavailable extends /** @type {ToolSelectorUnavailableClass} */ (
  taggedError("ToolSelectorUnavailable")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"SelectionInputInvalid", SelectionInputInvalidProps>} SelectionInputInvalidClass */
/** @typedef {{ readonly reason: string }} SelectionInputInvalidProps */
/**
 * A bound the caller set is not a whole number in range: `limit` below zero, `timeoutMs` below
 * one, or either not an integer. Raised before any selector runs; the reason names the field.
 */
export class SelectionInputInvalid extends /** @type {SelectionInputInvalidClass} */ (
  taggedError("SelectionInputInvalid")
) {}
