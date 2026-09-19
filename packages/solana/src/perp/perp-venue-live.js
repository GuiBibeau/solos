// @ts-check
import { PerpVenue } from "@solos/core";
import { Effect, Layer } from "effect";
import { getPositionFlow, listPositionsFlow } from "./perp-venue-read.js";

/**
 * Live Phoenix Perps adapter over the documented wire contract of the pinned Rise revision
 * (see phoenix-api.js for the pins). Reads are public: the config carries only a base URL
 * (default `https://perp-api.phoenix.trade`, plain http accepted for loopback fixtures) and no
 * credential, so the layer is always constructible — tool discovery never breaks, and an
 * unavailable provider surfaces per read as a transport error.
 * @param {import("./phoenix-api.js").PhoenixConfig} config
 */
export const PerpVenueLive = (config) =>
  Layer.effect(
    PerpVenue,
    Effect.succeed({
      getPosition: (request) => getPositionFlow(config, request),
      listPositions: (owner) => listPositionsFlow(config, owner),
    }),
  );
