#!/usr/bin/env bun
// @ts-check
/**
 * `solos-engine`: the engine binary. Flags match `solos engine start`; both call `startEngine`.
 */
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { engineStartCommand } from "./command.js";
import { ENGINE_VERSION } from "./version.js";

const cli = Command.run(engineStartCommand("solos-engine"), {
  name: "solos-engine",
  version: ENGINE_VERSION,
});

const program = /** @type {Effect.Effect<void, unknown, never>} */ (
  cli(process.argv).pipe(Effect.scoped, Effect.provide(BunContext.layer))
);

BunRuntime.runMain(program, { disableErrorReporting: false });
