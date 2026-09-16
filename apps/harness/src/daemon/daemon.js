// @ts-check
import { EventBus, EventSink, SignalSource, makeEvent } from "@solos/core";
import { Effect, Option, Stream } from "effect";

/** Every bus event is logged and appended to the sink. */
const forwardEvents = Effect.gen(function* () {
  const bus = yield* EventBus;
  const sink = yield* EventSink;
  const events = yield* bus.subscribe();
  yield* Stream.runForEach(events, (event) =>
    Effect.logInfo("event").pipe(
      Effect.annotateLogs({ type: event.type, at: event.at }),
      Effect.zipRight(sink.append(event)),
    ),
  );
});

/** Optional: when a SignalSource is provided, republish its items as `signal.received`. */
const forwardSignals = Effect.gen(function* () {
  const source = yield* Effect.serviceOption(SignalSource);
  if (Option.isNone(source)) {
    return yield* Effect.logInfo("no SignalSource provided; daemon idles on the event bus");
  }
  const bus = yield* EventBus;
  yield* Stream.runForEach(source.value.stream(), (signal) =>
    bus.publish(makeEvent("signal.received", signal)),
  );
});

/**
 * The long-running process. Forks the forwarders under the current scope and never returns
 * on its own; interruption (SIGINT) tears everything down through the scope.
 */
export const runDaemon = () =>
  Effect.gen(function* () {
    yield* Effect.logInfo("solos daemon starting");
    yield* Effect.forkScoped(forwardEvents);
    yield* Effect.forkScoped(forwardSignals);
    yield* Effect.never;
  }).pipe(Effect.scoped, Effect.withSpan("daemon.run"));
