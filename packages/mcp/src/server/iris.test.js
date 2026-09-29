// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet, randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

const KEY = "test-elfa-key";
const ANSWER =
  "SOL consolidates after the upgrade https://example.com/sol; the ETF filing remains speculation.";

describe("solos MCP Iris tool through a real server child [integration]", () => {
  /** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
  let surfnet;
  /** @type {{ requests: unknown[]; url: string; stop: () => void }} */
  let fixture;
  /** @type {Awaited<ReturnType<typeof connectMcp>>} */
  let withKey;
  /** @type {Awaited<ReturnType<typeof connectMcp>>} */
  let withoutKey;

  beforeAll(async () => {
    surfnet = await ensureSurfnet();
    fixture = startFixture();
    const baseEnv = {
      SOLANA_RPC_URL: surfnet.rpcUrl,
      SOLANA_WS_URL: surfnet.wsUrl,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_LOG_LEVEL: "warn",
      SOLOS_TOOLS: "all",
      SOLOS_TOOL_TIER: "execute",
    };
    withKey = await connectMcp({
      ...solosServerCommand(),
      env: { ...baseEnv, ELFA_API_KEY: KEY, ELFA_BASE_URL: fixture.url },
      stderr: "ignore",
    });
    withoutKey = await connectMcp({
      ...solosServerCommand(),
      env: { ...baseEnv, ELFA_BASE_URL: fixture.url },
      stderr: "ignore",
    });
  });

  afterAll(async () => {
    await withKey?.close();
    await withoutKey?.close();
    fixture?.stop();
  });

  test("advertises the Iris tool as read-tier market tool with a described question", async () => {
    const tools = await withKey.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("solana_market_ask_iris");
    expect(names).toContain("solana_wallet_get_balance");
    expect(names).toContain("solana_transfer_execute_sol");
    const iris = tools.find((t) => t.name === "solana_market_ask_iris");
    expect(iris?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(iris?._meta?.["solos/tier"]).toBe("read");
    expect(iris?._meta?.["solos/group"]).toBe("market");
    expect(iris?.inputSchema?.properties?.question?.description).toBeTruthy();
  });

  test("answers a market question through the real HTTP adapter", async () => {
    const before = fixture.requests.length;
    const result = await withKey.callTool("solana_market_ask_iris", {
      question: "What changed for SOL in the last 24 hours?",
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      provider: "elfa",
      answer: ANSWER,
      creditsConsumed: 2,
    });
    expect(typeof result.structuredContent?.receivedAt).toBe("number");
    expect(fixture.requests.length).toBe(before + 1);
  });

  test("a missing key surfaces IrisConfigMissing as a tool error, not a crash", async () => {
    const before = fixture.requests.length;
    const result = await withoutKey.callTool("solana_market_ask_iris", {
      question: "Any catalysts for SOL?",
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "IrisConfigMissing" });
    expect(fixture.requests.length).toBe(before);
  });

  test("an invalid question fails validation before the provider", async () => {
    const before = fixture.requests.length;
    const result = await withKey.callTool("solana_market_ask_iris", { question: " ".repeat(3) });
    expect(result.isError).toBe(true);
    expect(fixture.requests.length).toBe(before);
  });
});

/** Loopback Elfa fixture answering the documented success envelope, with a request counter. */
function startFixture() {
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push({ url: request.url, key: request.headers.get("x-elfa-api-key") });
      return Response.json({
        success: true,
        data: { message: ANSWER, sessionId: "s-9", creditsConsumed: 2 },
      });
    },
  });
  return { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}
