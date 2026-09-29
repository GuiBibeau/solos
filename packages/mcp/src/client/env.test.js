// @ts-check
import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureSurfnet, randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "./index.js";

const MINT = "So11111111111111111111111111111111111111112";
const PRICE = 100.46852810203305;
const INTENDED_KEY = "intended-jupiter-key";

/** Ambient .env a server child must never reload: decoy secrets for every provider. */
const writeDecoyEnv = (cwd) =>
  writeFile(
    path.join(cwd, ".env"),
    [
      'SOLOS_SIGNER_KEYPAIR_PATH="/never-read-a-user-wallet.json"',
      'ELFA_API_KEY="ambient-secret-must-not-be-used"',
      'JUPITER_API_KEY="ambient-secret-must-not-be-used"',
    ].join("\n"),
  );

/** Loopback price provider recording the x-api-key header of every request. */
const startProvider = () => {
  const keys = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      keys.push(request.headers.get("x-api-key") ?? undefined);
      return Response.json({ [MINT]: { usdPrice: PRICE, blockId: 4815, decimals: 9 } });
    },
  });
  return { keys, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** Child env with only Surfpool plus a disposable signer, then the given extras. */
const childEnv = async (surfnet, extra) => ({
  SOLANA_RPC_URL: surfnet.rpcUrl,
  SOLANA_WS_URL: surfnet.wsUrl,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  // These children are called directly, so they advertise every tool rather than discover.
  SOLOS_TOOLS: "all",
  ...extra,
});

test("MCP child ignores ambient .env credentials [integration]", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "solos-mcp-env-"));
  const surfnet = await ensureSurfnet();
  const provider = startProvider();
  /** @type {Awaited<ReturnType<typeof connectMcp>> | undefined} */
  let client;
  try {
    await writeDecoyEnv(cwd);
    client = await connectMcp({
      ...solosServerCommand(),
      cwd,
      stderr: "ignore",
      env: await childEnv(surfnet, { ELFA_BASE_URL: provider.url }),
    });
    const result = await client.callTool("solana_market_ask_iris", { question: "SOL?" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "IrisConfigMissing" });
    expect(provider.keys).toEqual([]);
  } finally {
    await client?.close();
    provider.stop(true);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("MCP child receives only the intended forwarded Jupiter values [integration]", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "solos-mcp-jupiter-env-"));
  const surfnet = await ensureSurfnet();
  const provider = startProvider();
  /** @type {Awaited<ReturnType<typeof connectMcp>> | undefined} */
  let client;
  try {
    await writeDecoyEnv(cwd);
    client = await connectMcp({
      ...solosServerCommand(),
      cwd,
      stderr: "ignore",
      env: await childEnv(surfnet, {
        JUPITER_API_KEY: INTENDED_KEY,
        JUPITER_BASE_URL: provider.url,
      }),
    });
    const result = await client.callTool("solana_market_get_price", { mint: MINT });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      mint: MINT,
      priceUsd: String(PRICE),
      source: "jupiter",
    });
    expect(provider.keys).toEqual([INTENDED_KEY]);
  } finally {
    await client?.close();
    provider.stop(true);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("MCP child without a forwarded Jupiter key fails pre-HTTP [integration]", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "solos-mcp-jupiter-nokey-"));
  const surfnet = await ensureSurfnet();
  const provider = startProvider();
  /** @type {Awaited<ReturnType<typeof connectMcp>> | undefined} */
  let client;
  try {
    await writeDecoyEnv(cwd);
    client = await connectMcp({
      ...solosServerCommand(),
      cwd,
      stderr: "ignore",
      env: await childEnv(surfnet, { JUPITER_BASE_URL: provider.url }),
    });
    const result = await client.callTool("solana_market_get_price", { mint: MINT });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "PriceConfigMissing" });
    expect(provider.keys).toEqual([]);
  } finally {
    await client?.close();
    provider.stop(true);
    await rm(cwd, { recursive: true, force: true });
  }
});
