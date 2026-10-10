// @ts-check
import { recoverTicks, runDueTicks } from "@solos/core/strategy";

/**
 * Recover in-flight Ticks, then optionally poll. Manual drive leaves the loop stopped so tests
 * advance a clock and call `runDue`.
 * ADR-0038 records unattended Strategy spending, the clock, and Ticks:
 * docs/adr/0038-unattended-strategy-spending.md
 * @param {import("./http.js").EngineDeps["runtime"]} runtime
 * @param {boolean} enabled
 * @param {{ tickDrive?: "manual" | "auto"; minIntervalMs: number }} start
 */
export const bootTicks = async (runtime, enabled, start) => {
  if (!enabled) return { runDue: async () => undefined, stop: async () => undefined };
  await runtime.runPromise(recoverTicks());
  const runDue = () => runtime.runPromise(runDueTicks());
  const stop =
    start.tickDrive === "auto" ? armed(runDue, start.minIntervalMs) : async () => undefined;
  return { runDue, stop };
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
