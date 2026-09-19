// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  ABSENT_MINT,
  CREDENTIAL,
  COMPLETED_MINT,
  expectedCompletedCurve,
  expectedFreshCurve,
  FRESH_MINT,
  runSolos,
  startLaunchFixture,
  startLeakyServer,
  stderrJson,
  UNSUPPORTED_QUOTE_MINT,
  USDC_QUOTE_MINT,
} from "./launch-curve-fixture.js";

/**
 * `solos launch curve` and `solos mcp call solana_launch_get_curve` through real child
 * processes against the loopback JSON-RPC fixture: JSON stdout, structured MCP results, and
 * non-zero exits with `{ code, ... }` JSON on every domain error. Each startup case is its
 * own independently named test.
 */

/** @type {Awaited<ReturnType<typeof startLaunchFixture>>} */
let fixture;
/** @type {ReturnType<typeof startLeakyServer>} */
let leaky;

beforeAll(async () => {
  fixture = await startLaunchFixture();
  leaky = startLeakyServer();
});

afterAll(() => {
  fixture?.stop();
  leaky?.stop();
});

describe("`solos launch curve` through real child processes [integration]", () => {
  test("a fresh curve prints the full LaunchCurve JSON and exits 0", async () => {
    const { stdout, code } = await runSolos(["launch", "curve", "--mint", FRESH_MINT], {
      ...(await fixture.env()),
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual(expectedFreshCurve());
  });

  test("a completed curve is a successful read with complete=true and 10000 bps", async () => {
    const { stdout, code } = await runSolos(["launch", "curve", "--mint", COMPLETED_MINT], {
      ...(await fixture.env()),
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual(expectedCompletedCurve());
  });

  test("an absent curve exits 1 with CurveUnavailable naming the derived PDA", async () => {
    const { stdout, stderr, code } = await runSolos(["launch", "curve", "--mint", ABSENT_MINT], {
      ...(await fixture.env()),
    });
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "CurveUnavailable",
      mint: ABSENT_MINT,
    });
  });

  test("a USDC-paired curve exits 1 with UnsupportedQuoteAsset and the quote mint", async () => {
    const { stdout, stderr, code } = await runSolos(
      ["launch", "curve", "--mint", UNSUPPORTED_QUOTE_MINT],
      { ...(await fixture.env()) },
    );
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "UnsupportedQuoteAsset",
      mint: UNSUPPORTED_QUOTE_MINT,
      quoteMint: USDC_QUOTE_MINT,
    });
  });

  test("a non-address mint exits 1 with CurveInputInvalid before any RPC", async () => {
    const { stdout, stderr, code } = await runSolos(
      ["launch", "curve", "--mint", "not-an-address"],
      {
        ...(await fixture.env()),
      },
    );
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "CurveInputInvalid" });
  });

  test("an RPC failure exits 1 with RpcError and the credential is redacted", async () => {
    const { stdout, stderr, code } = await runSolos(["launch", "curve", "--mint", FRESH_MINT], {
      SOLANA_RPC_URL: leaky.url,
      SOLOS_SIGNER_PRIVATE_KEY: (await fixture.env()).SOLOS_SIGNER_PRIVATE_KEY,
      SOLOS_LOG_LEVEL: "warn",
    });
    expect(code).toBe(1);
    expect(stdout).toBe("");
    const error = stderrJson(stderr)?.error;
    expect(error).toMatchObject({
      code: "RpcError",
      url: `http://127.0.0.1:${new URL(leaky.url).port}`,
      reason: "the configured RPC endpoint failed the request",
    });
    expect(stderr).not.toContain(CREDENTIAL);
  });
});

describe("`solos mcp call solana_launch_get_curve` through the real server child [integration]", () => {
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
