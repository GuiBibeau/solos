// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { ValidationSchema } from "./schema.js";
import { validateAcceptance } from "./validate.js";

/** Same pure gate in the orchestrator and stations; no model, network, or storage dependency. */
export const acceptanceTool = () =>
  defineTool({
    description:
      "Validate a complete acceptance matrix against original issue criteria and the last accepted matrix. Call before implementation and after every review/revision. Return all findings together. draft_deliverable permits a draft with explicitly deferred operator/CI QA; ready means final completion. valid alone is neither. Supply originals from the issue, never reconstructed from station output.",
    inputSchema: ValidationSchema,
    outputSchema: z.strictObject({
      valid: z.boolean(),
      ready: z.boolean(),
      draft_deliverable: z.boolean(),
      parked_row_ids: z.array(z.string()),
      unresolved: z.array(z.string()),
      findings: z.array(z.string()),
    }),
    execute: validateAcceptance,
  });
