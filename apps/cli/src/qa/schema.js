// @ts-check
import {
  MarketAnswerSchema,
  NewsResultSchema,
  SummaryResultSchema,
  TrendingResultSchema,
} from "@solos/core";
import { z } from "zod";

export const QaAnswerSchema = z.union([
  MarketAnswerSchema,
  TrendingResultSchema,
  NewsResultSchema,
  SummaryResultSchema,
]);
/** @typedef {z.infer<typeof QaAnswerSchema>} QaAnswer */
export const QaCaseSchema = z.object({
  name: z.string(),
  command: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  ms: z.number().int().nonnegative(),
  code: z.string().optional(),
  httpStatus: z.number().int().optional(),
  answer: QaAnswerSchema.optional(),
});
/** @typedef {z.infer<typeof QaCaseSchema>} QaCase */
export const IrisQaSchema = z
  .object({
    capability: z.enum(["iris", "elfa-market"]),
    mode: z.enum(["live", "fixture"]),
    endpoint: z.url(),
    status: z.enum(["passed", "failed", "blocked"]),
    reason: z.string().optional(),
    question: z.string().optional(),
    maxProviderRequests: z.union([z.literal(2), z.literal(6)]),
    callsStarted: z.number().int().min(0).max(6),
    reportedCredits: z.number().nonnegative(),
    usageComplete: z.boolean(),
    answerQuality: z.literal("unassessed"),
    cases: z.array(QaCaseSchema),
  })
  .refine(
    (qa) => {
      const names =
        qa.capability === "iris"
          ? ["cli", "mcp"]
          : ["cli-trending", "mcp-trending", "cli-news", "mcp-news", "cli-summary", "mcp-summary"];
      return (
        qa.maxProviderRequests === names.length &&
        qa.callsStarted <= names.length &&
        qa.cases.length === names.length &&
        qa.cases.every((item, i) => item.name === names[i])
      );
    },
    { message: "QA requires every named CLI and MCP case in order, within its request cap" },
  )
  .refine(
    (qa) =>
      qa.mode !== "live" ||
      qa.endpoint ===
        (qa.capability === "iris" ? "https://api.elfa.ai/v2/chat" : "https://api.elfa.ai"),
    { message: "Live QA must target the real Elfa endpoint" },
  )
  .refine(
    (qa) =>
      qa.status !== "passed" ||
      (qa.callsStarted === qa.maxProviderRequests && qa.cases.every(passedCase)),
    { message: "Passed QA requires every observed result with the matching contract" },
  );

/** @param {QaCase} item */
const passedCase = (item) => {
  if (item.status !== "passed" || !item.answer) return false;
  if (item.name.endsWith("trending")) return TrendingResultSchema.safeParse(item.answer).success;
  if (item.name.endsWith("news")) return NewsResultSchema.safeParse(item.answer).success;
  if (item.name.endsWith("summary")) return SummaryResultSchema.safeParse(item.answer).success;
  return MarketAnswerSchema.safeParse(item.answer).success;
};
/** @typedef {z.infer<typeof IrisQaSchema>} IrisQa */
