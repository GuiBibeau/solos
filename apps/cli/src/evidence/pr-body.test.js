import { describe, expect, test } from "bun:test";
import { checkPrBody, evidenceSection, firstJsonBlock, shaMatches } from "./pr-body.js";

const sampleEvidence = {
  ok: true,
  sha: "834f0b2caf1def4fffdeab4235ee0417d95c6955",
  dirty: false,
  scope: "unit",
  versions: { bun: "1.3.14", surfpool: null },
  steps: [
    {
      name: "line-limit",
      command: "bun run check:lines",
      ok: true,
      ms: 50,
      summary: "physical line gate passed",
    },
    {
      name: "format",
      command: "bun run format:check",
      ok: true,
      ms: 812,
      summary: "Checked 90 files",
    },
    { name: "lint", command: "bun run lint", ok: true, ms: 2400, summary: "ok" },
    { name: "depcruise", command: "bun run depcruise", ok: true, ms: 160, summary: "ok" },
    { name: "typecheck", command: "bun run typecheck", ok: true, ms: 300, summary: "ok" },
    { name: "test:unit", command: "bun run test:unit", ok: true, ms: 320, summary: "51 pass" },
  ],
  startedAt: "2026-09-16T12:00:00.000Z",
  durationMs: 3212,
};

const SHA = sampleEvidence.sha;

/** @param {object} evidence */
const bodyWith = (evidence) => `# Title

## Summary

Adds a thing.

## Evidence

\`\`\`json
${JSON.stringify(evidence, null, 2)}
\`\`\`

## Notes

\`\`\`json
{ "decoy": true }
\`\`\`
`;

describe("pr-body evidence check", () => {
  test("happy path: extracts, parses, and accepts the evidence", () => {
    const result = checkPrBody(bodyWith(sampleEvidence), SHA);
    expect(result.ok).toBe(true);
    expect(result.ok && result.evidence.sha).toBe(SHA);
  });

  test("accepts a 7+ char sha prefix in either direction", () => {
    expect(checkPrBody(bodyWith(sampleEvidence), SHA.slice(0, 7)).ok).toBe(true);
    expect(shaMatches("834f0b2", SHA)).toBe(true);
    expect(shaMatches("834f0b", SHA)).toBe(false);
    expect(shaMatches("deadbeef", SHA)).toBe(false);
  });

  test("missing ## Evidence section", () => {
    const result = checkPrBody("# Title\n\nno evidence here\n", SHA);
    expect(result).toEqual({ ok: false, reason: "missing `## Evidence` section" });
  });

  test("section without a json block does not pick up blocks from later sections", () => {
    const body = "## Evidence\n\nsee below\n\n## Notes\n\n```json\n{}\n```\n";
    const result = checkPrBody(body, SHA);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("no ```json block");
    expect(firstJsonBlock(evidenceSection(body) ?? "")).toBeUndefined();
  });

  test("sha mismatch", () => {
    const result = checkPrBody(
      bodyWith(sampleEvidence),
      "0123456789abcdef0123456789abcdef01234567",
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("sha mismatch");
  });

  test("dirty tree is rejected", () => {
    const result = checkPrBody(bodyWith({ ...sampleEvidence, dirty: true }), SHA);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("dirty");
  });

  test("steps must be exactly the scope's required steps, each passed", () => {
    const forged = checkPrBody(bodyWith({ ...sampleEvidence, steps: [] }), SHA);
    expect(forged.ok).toBe(false);
    if (!forged.ok) expect(forged.reason).toContain("requires steps");
    const partial = checkPrBody(bodyWith({ ...sampleEvidence, scope: "full" }), SHA);
    expect(partial.ok).toBe(false);
    const skipped = checkPrBody(
      bodyWith({
        ...sampleEvidence,
        steps: sampleEvidence.steps.map((step, i) => (i === 5 ? { ...step, ok: null } : step)),
      }),
      SHA,
    );
    expect(skipped.ok).toBe(false);
    if (!skipped.ok) expect(skipped.reason).toContain("test:unit");
  });

  test("failed verification is rejected", () => {
    const result = checkPrBody(bodyWith({ ...sampleEvidence, ok: false }), SHA);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("failed");
  });

  test("invalid JSON and schema violations are reported", () => {
    const broken = "## Evidence\n\n```json\n{ nope\n```\n";
    expect(!checkPrBody(broken, SHA).ok && checkPrBody(broken, SHA).reason).toContain(
      "not valid JSON",
    );
    const result = checkPrBody(bodyWith({ ...sampleEvidence, scope: "everything" }), SHA);
    expect(!result.ok && result.reason).toContain("schema");
  });
});
