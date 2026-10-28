// @ts-check

/**
 * Copy the open's position and a removal's quoted proceeds onto the execution result.
 * @param {import("@solos-sh/actions").ExecutionResult} confirmed
 * @param {{ readonly position?: string; readonly venueQuote: import("@solos-sh/actions").VenueQuote | null }} planned
 */
export const executionDetails = (confirmed, planned) => ({
  ...confirmed,
  ...(planned.position !== undefined && { position: planned.position }),
  ...removalAmounts(planned.venueQuote),
});

/** @param {import("@solos-sh/actions").VenueQuote | null | undefined} quote */
const removalAmounts = (quote) => {
  if (quote === null || quote === undefined || quote.kind !== "removal") return {};
  return { amountA: quote.estA, amountB: quote.estB };
};
