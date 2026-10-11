// @ts-check
import { Effect, Layer } from "effect";
import { ObservationReader } from "../ports/observation-reader.js";

/**
 * Fixed Observations for tests. `instant` always comes from the Tick. A missing declared name
 * fails the read so the runner records skipped_observation.
 * @param {() => Readonly<Record<string, string | number>>} values
 */
export const scriptedObservationReader = (values) =>
  Layer.sync(ObservationReader, () => ({
    read: (request) => Effect.sync(() => readScript(values(), request)),
  }));

/**
 * @param {Readonly<Record<string, string | number>>} values
 * @param {import("../ports/observation-reader.js").ObservationRequest} request
 */
const readScript = (values, request) => {
  /** @type {Record<string, string | number>} */
  const out = {};
  for (const name of request.names) {
    const value = name === "instant" ? request.instant : values[name];
    if (value === undefined) throw new Error(`observation ${name} is missing`);
    out[name] = value;
  }
  return out;
};
