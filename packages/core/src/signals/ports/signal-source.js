// @ts-check
import { Context } from "effect";

/**
 * A live feed exposed as a stream of `Signal`.
 * @typedef {{
 *   readonly name: string;
 *   readonly stream: () => import("effect").Stream.Stream<import("../domain/types.js").Signal, never, import("effect").Scope.Scope>;
 * }} SignalSourceShape
 */

export const SignalSource = /** @type {Context.Tag<SignalSourceShape, SignalSourceShape>} */ (
  Context.GenericTag("@solos/signals/SignalSource")
);
