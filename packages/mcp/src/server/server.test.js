import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
} from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

describe("solos MCP server over stdio [integration]", () => {
  /** @type {Awaited<ReturnType<typeof connectMcp>>} */
  let mcp;
  /** @type {string} */
  let owner;
  /** Fresh per run: the Surfnet is shared by every test file in the process. */
  /** @type {string} */
  let RECIPIENT;

  beforeAll(async () => {
    const surfnet = await ensureSurfnet();
    const seed = randomSeed();
    owner = await seedAddress(seed);
    RECIPIENT = await seedAddress(randomSeed());
    await surfnet.cheats.fundSol(owner, 1);
    mcp = await connectMcp({
      ...solosServerCommand(),
      env: {
        SOLANA_RPC_URL: surfnet.rpcUrl,
        SOLANA_WS_URL: surfnet.wsUrl,
        SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(seed),
        SOLOS_LOG_LEVEL: "warn",
      },
      stderr: "ignore",
    });
  });

  afterAll(async () => {
    await mcp?.close();
  });

  test("advertises itself with instructions and a flat, sorted tool list", async () => {
    expect(mcp.serverInfo?.name).toBe("solos");
    expect(mcp.instructions).toContain("- wallet:");
    const tools = await mcp.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual([...names].toSorted((a, b) => a.localeCompare(b)));
    expect(names).toContain("solana_wallet_get_balance");
    expect(names).toContain("solana_transfer_send_sol");
  });

  test("maps tiers to annotations and interaction hints", async () => {
    const tools = await mcp.listTools();
    const read = tools.find((t) => t.name === "solana_wallet_get_balance");
    const exec = tools.find((t) => t.name === "solana_transfer_send_sol");
    expect(read?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(read?._meta?.["anthropic/requiresUserInteraction"]).toBe(false);
    expect(exec?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(exec?._meta?.["anthropic/requiresUserInteraction"]).toBe(true);
    expect(exec?.inputSchema.properties?.to?.description).toBeTruthy();
  });

  test("reads the signer balance", async () => {
    const result = await mcp.callTool("solana_wallet_get_balance", {});
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ owner, sol: "1", tokens: [] });
  });

  test("sends SOL and returns a receipt", async () => {
    const result = await mcp.callTool("solana_transfer_send_sol", {
      to: RECIPIENT,
      amountSol: "0.1",
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      from: owner,
      to: RECIPIENT,
      lamports: "100000000",
      simulated: true,
    });
    const balance = await mcp.callTool("solana_wallet_get_balance", { owner: RECIPIENT });
    expect(balance.structuredContent).toMatchObject({ lamports: "100000000" });
  });

  test("surfaces domain errors as structured tool errors", async () => {
    const result = await mcp.callTool("solana_transfer_send_sol", { to: RECIPIENT, amountSol: 50 });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "InsufficientFunds", owner });
  });

  test("rejects invalid input before touching the chain", async () => {
    const result = await mcp.callTool("solana_transfer_send_sol", {
      to: "not-an-address",
      amountSol: 1,
    });
    expect(result.isError).toBe(true);
  });
});
