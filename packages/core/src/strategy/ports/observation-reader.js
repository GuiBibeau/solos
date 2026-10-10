// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly names: readonly string[];
 *   readonly strategyId: string;
 *   readonly instant: number;
 * }} ObservationRequest
 */

/**
 * @typedef {{
 *   readonly read: (
 *     request: ObservationRequest,
 *   ) => import("effect").Effect.Effect<Readonly<Record<string, string | number>>>;
 * }} ObservationReaderShape
 */

/** Reads the Observations a kind declared. Kinds never touch this port. The TickRunner does. */
export const ObservationReader =
  /** @type {Context.Tag<ObservationReaderShape, ObservationReaderShape>} */ (
    Context.GenericTag("@solos/strategy/ObservationReader")
  );
