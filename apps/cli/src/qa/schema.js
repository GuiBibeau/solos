// @ts-check
import { MarketAnswerSchema } from "@solos/core";
import { z } from "zod";

export const QaCaseSchema = z.object({
  name: z.enum(["cli", "mcp"]),
  command: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  ms: z.number().int().nonnegative(),
  code: z.string().optional(),
  httpStatus: z.number().int().optional(),
  answer: MarketAnswerSchema.optional(),
});

/** @typedef {z.infer<typeof QaCaseSchema>} QaCase */

export const IrisQaSchema = z
  .object({
    capability: z.literal("iris"),
    mode: z.enum(["live", "fixture"]),
    endpoint: z.url(),
    status: z.enum(["passed", "failed", "blocked"]),
    reason: z.string().optional(),
    question: z.string(),
    maxProviderRequests: z.literal(2),
    callsStarted: z.number().int().min(0).max(2),
    reportedCredits: z.number().nonnegative(),
    usageComplete: z.boolean(),
    answerQuality: z.literal("unassessed"),
    cases: z.tuple([QaCaseSchema, QaCaseSchema]),
  })
  .refine((qa) => qa.cases[0].name === "cli" && qa.cases[1].name === "mcp", {
    message: "Iris QA requires CLI then MCP evidence",
  })
  .refine((qa) => qa.mode !== "live" || qa.endpoint === "https://api.elfa.ai/v2/chat", {
    message: "Live QA must target the real Elfa endpoint",
  })
  .refine(
    (qa) =>
      qa.status !== "passed" ||
      (qa.callsStarted === 2 && qa.cases.every((item) => item.status === "passed" && item.answer)),
    { message: "Passed QA requires both observed answers" },
  );

/** @typedef {z.infer<typeof IrisQaSchema>} IrisQa */
