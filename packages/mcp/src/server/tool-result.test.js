// @ts-check
import { describe, expect, test } from "bun:test";
import { BuildRejected } from "@solos/core";
import { Exit } from "effect";
import { resultFromExit, thrownResult } from "./tool-result.js";

const REASON = "the funding account does not exist";
const REMEDY = "pass wrapSol: true to wrap native SOL for this side";

describe("MCP tool result envelopes", () => {
  test("a failed effect surfaces code, reason and remedy", () => {
    const result = resultFromExit(Exit.fail(new BuildRejected({ reason: REASON, remedy: REMEDY })));
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      code: "BuildRejected",
      reason: REASON,
      remedy: REMEDY,
    });
  });

  test("an input-guard rejection carries the remedy too, not just the reason", () => {
    const result = thrownResult(new BuildRejected({ reason: REASON, remedy: REMEDY }));
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "BuildRejected", remedy: REMEDY });
  });

  test("a defect stays InternalError and leaks no stack trace", () => {
    const result = resultFromExit(Exit.die(new Error("boom")));
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("    at ");
  });
});
