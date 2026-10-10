// @ts-check
import { Context } from "effect";

/**
 * The Engine-wide mint allowlist the Registry narrows against. Empty means any mint.
 * The bounds child owns how the Operator configures it. Registration only reads it.
 * @typedef {{ readonly mints: ReadonlyArray<string> }} EngineAllowlistShape
 */

export const EngineAllowlist =
  /** @type {Context.Tag<EngineAllowlistShape, EngineAllowlistShape>} */ (
    Context.GenericTag("@solos/strategy/EngineAllowlist")
  );
