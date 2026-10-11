// @ts-check
/**
 * Turn a plan refusal into `BuildRejected`, keeping a remedy when the plan named one.
 * Callers that have no next action omit it; this does not invent one.
 */
import { BuildRejected } from "@solos/core";

/** @param {{ readonly reason: string; readonly remedy?: string }} refused */
export const planRejected = (refused) =>
  new BuildRejected(
    refused.remedy === undefined
      ? { reason: refused.reason }
      : { reason: refused.reason, remedy: refused.remedy },
  );
