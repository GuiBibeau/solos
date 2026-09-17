// @ts-check
import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureSurfnet, randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "./index.js";

test("MCP child ignores ambient .env credentials [integration]", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "solos-mcp-env-"));
  const surfnet = await ensureSurfnet();
  let calls = 0;
  const provider = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      calls++;
      return Response.json({ unexpected: true });
    },
  });
  /** @type {Awaited<ReturnType<typeof connectMcp>> | undefined} */
  let client;
  try {
    await writeFile(
      path.join(cwd, ".env"),
      [
        'SOLOS_SIGNER_KEYPAIR_PATH="/never-read-a-user-wallet.json"',
        'ELFA_API_KEY="ambient-secret-must-not-be-used"',
      ].join("\n"),
    );
    client = await connectMcp({
      ...solosServerCommand(),
      cwd,
      stderr: "ignore",
      env: {
        SOLANA_RPC_URL: surfnet.rpcUrl,
        SOLANA_WS_URL: surfnet.wsUrl,
        SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
        ELFA_BASE_URL: `http://127.0.0.1:${provider.port}`,
      },
    });
    const result = await client.callTool("solana_market_ask_iris", { question: "SOL?" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "IrisConfigMissing" });
    expect(calls).toBe(0);
  } finally {
    await client?.close();
    provider.stop(true);
    await rm(cwd, { recursive: true, force: true });
  }
});
