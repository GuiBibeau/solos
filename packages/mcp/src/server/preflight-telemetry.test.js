// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedAddress } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

const DEAD_RPC_URL = "http://127.0.0.1:1";
const MISSING_KEYPAIR_PATH = path.join(
  tmpdir(),
  `solos-qa-missing-${crypto.randomUUID()}`,
  "keypair.json",
);
const TOOL = "solana_transfer_simulate_sol";

describe("preflight rejection telemetry over stdio MCP [integration]", () => {
  /** @type {Awaited<ReturnType<typeof connectMcp>> | undefined} */
  let mcp;
  /** @type {string | undefined} */
  let configDir;
  /** @type {string} */
  let RECIPIENT;
  /** Everything the server printed on stderr, captured by a background pump. */
  let stderrText = "";
  /** @type {Promise<void> | undefined} */
  let pump;

  beforeAll(async () => {
    RECIPIENT = await seedAddress(randomSeed());
    configDir = await mkdtemp(path.join(tmpdir(), "solos-mcp-telemetry-"));
    mcp = await connectMcp({
      ...solosServerCommand(),
      env: {
        SOLANA_RPC_URL: DEAD_RPC_URL,
        SOLOS_SIGNER_KEYPAIR_PATH: MISSING_KEYPAIR_PATH,
        SOLOS_CONFIG_DIR: configDir,
        SOLOS_LOG_LEVEL: "warn",
      },
      stderr: "pipe",
    });
    // The SDK exposes the piped child stderr on the transport; capture it while the client runs.
    const stream = /** @type {any} */ (mcp.transport)?.stderr;
    if (stream) {
      const decoder = new TextDecoder();
      pump = (async () => {
        try {
          for await (const chunk of stream) {
            stderrText += decoder.decode(chunk, { stream: true });
          }
        } catch {
          // the stream ends with the server process; nothing to do
        }
      })();
    }
  });

  afterAll(async () => {
    await mcp?.close();
    await pump?.catch(() => undefined);
    await rm(configDir ?? "", { recursive: true, force: true });
  });

  test("a guard rejection logs tool.failed on stderr, not on stdout, and stays structured", async () => {
    const result = await mcp?.callTool(TOOL, { to: RECIPIENT, amountSol: "0" });
    // The structured rejection still travels as the tool result on stdout's JSON-RPC stream;
    // its payload carries the domain error and never a log line.
    expect(result?.isError).toBe(true);
    expect(result?.structuredContent).toMatchObject({
      code: "ValidationError",
      field: "amountSol",
    });
    expect(result?.content?.[0]?.text).not.toContain("tool.failed");
    // ADR-0011 telemetry reached stderr as JSON: same span, tool annotation, warning level.
    const deadline = Date.now() + 10_000;
    while (!stderrText.includes("tool.failed") && Date.now() < deadline) {
      await Bun.sleep(50);
    }
    const logged = stderrText
      .split("\n")
      .map((line) => (line.startsWith("{") ? JSON.parse(line) : null))
      .find((line) => line?.message === "tool.failed");
    expect(logged).toMatchObject({ logLevel: "WARN", annotations: { tool: TOOL } });
    expect(String(logged?.annotations?.cause)).toContain("ValidationError");
    expect(logged?.spans).toBeDefined();
  });
});
