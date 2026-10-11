// @ts-check
import { Context } from "effect";

/**
 * The Engine-wide shortest clock interval. The Operator sets it. No Caller can lower it.
 * @typedef {{ readonly minIntervalMs: number }} CadenceFloorShape
 */

export const CadenceFloor = /** @type {Context.Tag<CadenceFloorShape, CadenceFloorShape>} */ (
  Context.GenericTag("@solos/strategy/CadenceFloor")
);
