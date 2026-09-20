// @ts-check
import { describe, expect, test } from "bun:test";
import {
  evidenceRaw,
  hasValidTargetEvidence,
  validatePublicationEvidence,
  withEvidence,
} from "./publication-evidence.js";
import { fullEvidence, OTHER_SHA, TARGET_SHA } from "./publication-fixture.js";

describe("Evidence publication body", () => {
  test("accepts only clean exact-head full Evidence", () => {
    expect(validatePublicationEvidence(fullEvidence(), TARGET_SHA)).toEqual({ ok: true });
    expect(validatePublicationEvidence(fullEvidence(OTHER_SHA), TARGET_SHA)).toEqual({
      ok: false,
      reason: "Evidence sha does not equal the full target sha.",
    });
    const narrow = JSON.parse(fullEvidence());
    narrow.scope = "unit";
    expect(validatePublicationEvidence(JSON.stringify(narrow), TARGET_SHA).ok).toBe(false);
    const dirty = JSON.parse(fullEvidence());
    dirty.dirty = true;
    expect(validatePublicationEvidence(JSON.stringify(dirty), TARGET_SHA).ok).toBe(false);
  });

  test("replaces only the Evidence section and preserves unrelated edits", () => {
    const old = fullEvidence(OTHER_SHA);
    const body = `Intro changed by a human\n\n## Evidence\n\n\`\`\`json\n${old}\n\`\`\`\n\n## Review context\n\nKeep verbatim.\n`;
    const next = withEvidence(body, fullEvidence());
    expect(next).toStartWith("Intro changed by a human");
    expect(next).toEndWith("## Review context\n\nKeep verbatim.\n");
    expect(evidenceRaw(next)).toBe(fullEvidence());
    expect(hasValidTargetEvidence(next, TARGET_SHA)).toBe(true);
  });

  test("appends a missing Evidence section without disturbing the body", () => {
    const body = "Intro\n\n## Notes\n\nHuman context.";
    const next = withEvidence(body, fullEvidence());
    expect(next).toContain(body);
    expect(next).toContain("## Evidence");
    expect(hasValidTargetEvidence(next, TARGET_SHA)).toBe(true);
  });
});
