// @ts-check
import { Context } from "effect";

/**
 * Identity of the configured signer. Key material never crosses this port;
 * adapters that need to sign hold their own handle to the underlying signer.
 * @typedef {{
 *   readonly backend: string;
 *   readonly address: () => import("effect").Effect.Effect<
 *     import("../../shared/domain/address.js").Address,
 *     import("../domain/errors.js").SignerUnavailable
 *   >;
 * }} SignerShape
 */

export const Signer = /** @type {Context.Tag<SignerShape, SignerShape>} */ (
  Context.GenericTag("@solos/wallet/Signer")
);
