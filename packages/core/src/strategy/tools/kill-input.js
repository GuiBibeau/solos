// @ts-check
import { z } from "zod";

export const killScope = z
  .string()
  .min(1)
  .describe(
    "Kill switch scope: global pauses every Strategy, or a Strategy id pauses only that one",
  );

export const killReason = z
  .string()
  .min(1)
  .describe("Why the switch is engaged. The next refused reserve repeats this reason");

export const engageKillInput = z.object({ scope: killScope, reason: killReason });

export const killScopeInput = z.object({ scope: killScope });
