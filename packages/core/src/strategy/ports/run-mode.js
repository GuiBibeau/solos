// @ts-check
import { Context } from "effect";

/**
 * Whether this Engine may send. Dry run records Actions and creates no Intents.
 * @typedef {{ readonly dry: boolean }} RunModeShape
 */

export const RunMode = /** @type {Context.Tag<RunModeShape, RunModeShape>} */ (
  Context.GenericTag("@solos/strategy/RunMode")
);
