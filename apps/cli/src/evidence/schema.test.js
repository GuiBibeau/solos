import { describe, expect, test } from "bun:test";
import { EvidenceSchema, StepSchema } from "./schema.js";

const sampleEvidence = {
  ok: true,
  sha: "834f0b2caf1def4fffdeab4235ee0417d95c6955",
  dirty: false,
  scope: "unit",
  versions: { bun: "1.3.14", surfpool: null },
  steps: [
    {
      name: "format",
      command: "bun run format:check",
      ok: true,
      ms: 812,
      summary: "Checked 90 files",
    },
    { name: "lint", command: "bun run lint", ok: true, ms: 2400, summary: "ok" },
  ],
  startedAt: "2026-09-16T12:00:00.000Z",
  durationMs: 3212,
};

describe("evidence schema", () => {
  test("accepts a full Evidence object", () => {
    expect(EvidenceSchema.parse(sampleEvidence)).toEqual(sampleEvidence);
  });

  test("skipped steps carry ok: null", () => {
    const step = {
      name: "typecheck",
      command: "bun run typecheck",
      ok: null,
      ms: 0,
      summary: "skipped",
    };
    expect(StepSchema.parse(step)).toEqual(step);
  });

  test("rejects unknown scope, non-hex sha, and non-ISO startedAt", () => {
    expect(EvidenceSchema.safeParse({ ...sampleEvidence, scope: "all" }).success).toBe(false);
    expect(EvidenceSchema.safeParse({ ...sampleEvidence, sha: "not-a-sha" }).success).toBe(false);
    expect(EvidenceSchema.safeParse({ ...sampleEvidence, startedAt: "today" }).success).toBe(false);
  });

  test("rejects summaries over 200 chars and missing versions", () => {
    const long = { ...sampleEvidence.steps[0], summary: "x".repeat(201) };
    expect(StepSchema.safeParse(long).success).toBe(false);
    const noVersions = { ...sampleEvidence, versions: undefined };
    expect(EvidenceSchema.safeParse(noVersions).success).toBe(false);
  });
});
