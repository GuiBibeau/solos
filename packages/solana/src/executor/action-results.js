// @ts-check
/**
 * The two `@solos/actions` results every branch of the direct-signer executor returns, shaped
 * once from what Submission reports.
 */
import { Clock, Effect } from "effect";
import { simulationErrorText } from "./simulation-error-text.js";

/**
 * @param {import("@solos/actions").Action} action
 * @param {import("../submission/simulate.js").Simulated} simulated
 * @param {import("@solos/actions").VenueQuote | null} venueQuote
 * @returns {import("@solos/actions").SimulationResult}
 */
export const simulationResult = (action, simulated, venueQuote) => {
  const isOk = simulated.err === null;
  return {
    action,
    ok: isOk,
    unitsConsumed: simulated.unitsConsumed,
    logs: simulated.logs,
    projectedPortfolio: null,
    venueQuote,
    violations: isOk ? [] : [{ rule: "simulation", message: simulationErrorText(simulated.err) }],
  };
};

/**
 * @param {import("@solos/actions").Action} action
 * @param {import("../submission/submission.js").Delivered} delivered
 */
export const executionResult = (action, delivered) =>
  Effect.map(Clock.currentTimeMillis, (executedAt) => ({
    action,
    status: /** @type {const} */ ("confirmed"),
    signature: delivered.signature,
    executedAt,
    simulated: delivered.simulated,
    error: null,
  }));
