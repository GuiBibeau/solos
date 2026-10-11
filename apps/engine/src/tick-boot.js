// @ts-check
import path from "node:path";
import { recoverTicks, runDueTicks } from "@solos/core/strategy";
import { openIntents } from "./intents.js";
import { reconcileOpenTicks } from "./tick-clock-loop.js";

/**
 * Recover in-flight Ticks, then optionally poll. Each pass reconciles Ticks left `in_flight`
 * (the same function boot runs) before due ticks. Manual drive leaves the loop stopped so tests
 * advance a clock and call `runDue`.
 * ADR-0038 records unattended Strategy spending, the clock, and Ticks:
 * docs/adr/0038-unattended-strategy-spending.md
 * @param {import("./http.js").EngineDeps["runtime"]} runtime
 * @param {boolean} enabled
 * @param {{ tickDrive?: "manual" | "auto"; minIntervalMs: number; dataDir: string }} start
 */
export const bootTicks = async (runtime, enabled, start) => {
  if (!enabled) return { runDue: async () => undefined, stop: async () => undefined };
  const db = openIntents(path.join(start.dataDir, "intents.sqlite"));
  const queue = passQueue();
  const reconcile = () => reconcileOpenTicks(runtime, db);
  const runDue = () => queue(() => reconcile().then(() => runtime.runPromise(runDueTicks())));
  try {
    await queue(reconcile);
    await runtime.runPromise(recoverTicks());
  } catch (error) {
    db.close();
    throw error;
  }
  const stopLoop =
    start.tickDrive === "auto" ? armed(runDue, start.minIntervalMs) : async () => undefined;
  return {
    runDue,
    stop: async () => {
      await stopLoop();
      await queue(() => Promise.resolve());
      db.close();
    },
  };
};

/** Serialize passes so a slow tick cannot overlap the next one. */
const passQueue = () => {
  /** @type {Promise<unknown>} */
  let tail = Promise.resolve();
  /** @param {() => Promise<unknown>} job */
  return (job) => {
    const run = tail.catch(() => undefined).then(job);
    tail = run.then(() => undefined).catch(() => undefined);
    return run;
  };
};

/**
 * @param {() => Promise<unknown>} runDue
 * @param {number} intervalMs
 */
const armed = (runDue, intervalMs) => {
  const timer = setInterval(() => {
    runDue().catch((error) => {
      const reason = error instanceof Error ? error.message : "tick loop failed";
      process.stderr.write(`${JSON.stringify({ message: "tick loop failed", reason })}\n`);
    });
  }, intervalMs);
  timer.unref();
  return async () => {
    clearInterval(timer);
  };
};
