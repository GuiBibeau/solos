// @ts-check
import { Effect, Layer } from "effect";
import { EventSink } from "../ports/event-sink.js";

export const EventSinkNoop = Layer.succeed(EventSink, { append: () => Effect.void });
