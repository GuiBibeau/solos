// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"SignerUnavailable", SignerUnavailableProps>} SignerUnavailableClass */
/** @typedef {{ readonly backend: string; readonly reason: string }} SignerUnavailableProps */
/** The configured signer cannot sign right now (missing key, remote backend down). */
export class SignerUnavailable extends /** @type {SignerUnavailableClass} */ (
  taggedError("SignerUnavailable")
) {}
