// @ts-check
import { describe, expect, test } from "bun:test";
import { checkPrBody } from "../evidence/pr-body.js";
import { REQUIRED_STEPS } from "../evidence/schema.js";
import { IrisQaSchema } from "./schema.js";

const ANSWER = {
  provider: "elfa",
  answer: "Observed answer",
  creditsConsumed: 1,
  receivedAt: 1000,
};
const QA = {
  capability: "iris",
  mode: "live",
  endpoint: "https://api.elfa.ai/v2/chat",
  status: "passed",
  question: "SOL?",
  maxProviderRequests: 2,
  callsStarted: 2,
  reportedCredits: 2,
  usageComplete: true,
  answerQuality: "unassessed",
  cases: [
    { name: "cli", command: "solos market ask", status: "passed", ms: 100, answer: ANSWER },
    { name: "mcp", command: "solos mcp call", status: "passed", ms: 100, answer: ANSWER },
  ],
};
const SHA = "a".repeat(40);

/** @param {unknown} qa */
const bodyWithQa = (qa) =>
  `## Evidence\n\n\`\`\`json\n${JSON.stringify({
    ok: true,
    sha: SHA,
    dirty: false,
    scope: "check",
    versions: { bun: "1.3.14", surfpool: "1.3.1" },
    steps: REQUIRED_STEPS.check.map((name) => ({
      name,
      command: name,
      ok: true,
      ms: 1,
      summary: "ok",
    })),
    qa,
    startedAt: "2026-09-17T00:00:00.000Z",
    durationMs: 100,
  })}\n\`\`\`\n`;

describe("Iris QA evidence", () => {
  test("requires both named observed answers for a passing verdict", () => {
    expect(IrisQaSchema.safeParse(QA).success).toBe(true);
    expect(IrisQaSchema.safeParse({ ...QA, cases: [] }).success).toBe(false);
    expect(IrisQaSchema.safeParse({ ...QA, callsStarted: 1 }).success).toBe(false);
    expect(IrisQaSchema.safeParse({ ...QA, endpoint: "http://127.0.0.1/v2/chat" }).success).toBe(
      false,
    );
    const cases = QA.cases.map((item) => ({ ...item, status: "skipped", answer: undefined }));
    expect(IrisQaSchema.safeParse({ ...QA, cases }).success).toBe(false);
  });

  test("PR evidence refuses blocked QA and fixture evidence even with a forged top-level ok", () => {
    expect(checkPrBody(bodyWithQa(QA), SHA).ok).toBe(true);
    expect(checkPrBody(bodyWithQa(QA), SHA.slice(0, 7)).ok).toBe(false);
    expect(checkPrBody(bodyWithQa({ ...QA, mode: "fixture" }), SHA).ok).toBe(false);
    expect(checkPrBody(bodyWithQa({ ...QA, status: "blocked" }), SHA).ok).toBe(false);
  });
});
