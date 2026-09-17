// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { runIrisQa } from "./iris.js";

const KEY = "offline-qa-key";
const ANSWER = "SOL news https://example.com/sol; this is an offline fixture.";
/** @type {ReturnType<typeof Bun.serve> | undefined} */
let server;

afterEach(() => {
  server?.stop(true);
  server = undefined;
});

/** @param {number} [status] @param {unknown} [body] */
const fixture = (status = 200, body) => {
  const payload = body ?? {
    success: true,
    data: { message: ANSWER, sessionId: "qa-session", creditsConsumed: 2 },
  };
  /** @type {Array<{ method: string; url: string; key: string | null; body: any }>} */
  const requests = [];
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push({
        method: request.method,
        url: request.url,
        key: request.headers.get("x-elfa-api-key"),
        body: await request.json(),
      });
      return Response.json(payload, { status });
    },
  });
  return { baseUrl: `http://127.0.0.1:${server.port}`, requests };
};

describe("Iris QA through CLI and MCP [integration]", () => {
  test("runs both public surfaces once, records answers and actual credits, marks fixtures honestly", async () => {
    const provider = fixture();
    const result = await runIrisQa({ apiKey: KEY, baseUrl: provider.baseUrl });
    expect(result).toMatchObject({
      status: "passed",
      mode: "fixture",
      callsStarted: 2,
      reportedCredits: 4,
      usageComplete: true,
      answerQuality: "unassessed",
    });
    expect(result.cases.map((item) => [item.name, item.status, item.answer?.answer])).toEqual([
      ["cli", "passed", ANSWER],
      ["mcp", "passed", ANSWER],
    ]);
    expect(provider.requests).toHaveLength(2);
    for (const request of provider.requests) {
      expect(request).toMatchObject({
        method: "POST",
        key: KEY,
        body: { analysisType: "chat", speed: "fast", message: result.question },
      });
      expect(request.url).toBe(`${provider.baseUrl}/v2/chat`);
    }
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  test("missing credential is blocked with zero requests and skipped cases", async () => {
    const provider = fixture();
    const result = await runIrisQa({ baseUrl: provider.baseUrl });
    expect(result).toMatchObject({
      status: "blocked",
      callsStarted: 0,
      reason: "ELFA_API_KEY is not configured",
    });
    expect(result.cases.every((item) => item.status === "skipped")).toBe(true);
    expect(provider.requests).toHaveLength(0);
  });

  test("account rejection stops after one request, never prints the key or response body", async () => {
    const provider = fixture(403, { error: `private upstream message ${KEY}` });
    const result = await runIrisQa({ apiKey: KEY, baseUrl: provider.baseUrl });
    expect(result).toMatchObject({ status: "blocked", callsStarted: 1, usageComplete: false });
    expect(result.cases[0]).toMatchObject({
      status: "failed",
      code: "IrisAuthFailed",
      httpStatus: 403,
    });
    expect(result.cases[1].status).toBe("skipped");
    expect(provider.requests).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain("private upstream");
  });

  test("a malformed provider success fails QA and prevents the second paid call", async () => {
    const provider = fixture(200, { success: true, data: {} });
    const result = await runIrisQa({ apiKey: KEY, baseUrl: provider.baseUrl });
    expect(result).toMatchObject({ status: "failed", callsStarted: 1 });
    expect(result.cases[0].code).toBe("IrisResponseInvalid");
    expect(result.cases[1].status).toBe("skipped");
    expect(provider.requests).toHaveLength(1);
  });

  test("redacts a credential echoed in a successful answer", async () => {
    const provider = fixture(200, {
      success: true,
      data: {
        message: `unsafe echo ${KEY}`,
        sessionId: "qa",
        creditsConsumed: 1,
      },
    });
    const result = await runIrisQa({ apiKey: KEY, baseUrl: provider.baseUrl });
    expect(result.status).toBe("passed");
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(result.cases[0].answer?.answer).toBe("unsafe echo [redacted]");
  });
});
