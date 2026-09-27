// @ts-check
import { mkdirSync } from "node:fs";
import path from "node:path";
import { Command } from "@effect/cli";
import { loadHarness, runDaemon } from "@solos/harness";
import { Effect } from "effect";
import { exitOnFailure } from "../output.js";

export const daemon = Command.make("daemon", {}, () =>
  Effect.gen(function* () {
    const { layer, config } = yield* Effect.tryPromise({
      try: () => loadHarness(),
      catch: (error) => error,
    });
    mkdirSync(path.dirname(config.daemon.storePath), { recursive: true });
    yield* runDaemon().pipe(Effect.provide(layer));
  }).pipe(exitOnFailure),
).pipe(Command.withDescription("Run the long-lived harness: event bus, signal feeds, store"));
