// @ts-check
import { Effect, Layer, PubSub, Stream } from "effect";
import { EventBus } from "../ports/event-bus.js";

/**
 * Effect PubSub behind the EventBus port. `subscribe` registers eagerly, so every event
 * published after it resolves is delivered; events before it are missed.
 */
export const EventBusInMemory = Layer.effect(
  EventBus,
  Effect.gen(function* () {
    /** @type {PubSub.PubSub<import("../domain/event.js").SolosEvent>} */
    const pubsub = yield* PubSub.unbounded();
    return {
      publish: (event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
      subscribe: () =>
        PubSub.subscribe(pubsub).pipe(Effect.map((queue) => Stream.fromQueue(queue))),
    };
  }),
);
