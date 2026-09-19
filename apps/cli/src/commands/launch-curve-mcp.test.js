// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  ABSENT_MINT,
  expectedFreshCurve,
  FRESH_MINT,
  runSolos,
  startLaunchFixture,
} from "./launch-curve-fixture.js";

/**
 * `solos mcp call solana_launch_get_curve` through the real MCP server child: structured
 * results on success, `isError` with the tagged code on failure, env forwarded to the child.
 * Each startup case is its own independently named test.
 */

/** @type {Awaited<ReturnType<typeof startLaunchFixture>>} */
let fixture;

beforeAll(async () => {
  fixture = await startLaunchFixture();
});

afterAll(() => fixture?.stop());

describe("`solos mcp call solana_launch_get_curve` [integration]", () => {
  test("the success mirror returns the matching structured result", async () => {
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_launch_get_curve", "--args", JSON.stringify({ mint: FRESH_MINT })],
      { ...(await fixture.env()) },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(expectedFreshCurve());
  });

  test("the failure mirror carries isError with the tagged code", async () => {
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_launch_get_curve", "--args", JSON.stringify({ mint: ABSENT_MINT })],
      { ...(await fixture.env()) },
    );
    expect(code).toBe(1);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "CurveUnavailable",
      mint: ABSENT_MINT,
    });
  });

  test("mcp list advertises the launch curve tool with forwarded env", async () => {
    const { stdout, code } = await runSolos(["mcp", "list"], { ...(await fixture.env()) });
    expect(code).toBe(0);
    const tools = JSON.parse(stdout).tools;
    const launch = tools.find(
      (/** @type {{ name: string }} */ t) => t.name === "solana_launch_get_curve",
    );
    expect(launch).toMatchObject({
      name: "solana_launch_get_curve",
      annotations: { readOnlyHint: true },
      meta: { "solos/group": "launch", "solos/tier": "read" },
    });
  });
});
