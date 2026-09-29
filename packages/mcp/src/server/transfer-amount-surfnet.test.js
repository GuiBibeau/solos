// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
} from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

describe("transfer amount boundary over stdio MCP, positive against Surfnet [integration]", () => {
  /** @type {Awaited<ReturnType<typeof connectMcp>> | undefined} */
  let mcp;
  /** Fresh per run; funded so one-lamport simulations stay rent-exempt. */
  /** @type {string} */
  let RECIPIENT;
  /** @type {string | undefined} */
  let configDir;

  beforeAll(async () => {
    const surfnet = await ensureSurfnet();
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    RECIPIENT = await seedAddress(randomSeed());
    await surfnet.cheats.fundSol(owner, 1);
    await surfnet.cheats.fundSol(RECIPIENT, 0.01);
    configDir = await mkdtemp(path.join(tmpdir(), "solos-mcp-transfer-"));
    mcp = await connectMcp({
      ...solosServerCommand(),
      env: {
        SOLANA_RPC_URL: surfnet.rpcUrl,
        SOLANA_WS_URL: surfnet.wsUrl,
        SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(seed),
        SOLOS_CONFIG_DIR: configDir,
        SOLOS_LOG_LEVEL: "warn",
        SOLOS_TOOLS: "all",
      },
      stderr: "ignore",
    });
  });

  afterAll(async () => {
    await mcp?.close();
    await rm(configDir ?? "", { recursive: true, force: true });
  });

  /** @param {string | number} amountSol */
  const simulate = (amountSol) =>
    mcp?.callTool("solana_transfer_simulate_sol", { to: RECIPIENT, amountSol });

  test("normalizes numeric 1e-9 to exactly one lamport", async () => {
    const result = await simulate(1e-9);
    expect(result?.isError).toBeFalsy();
    expect(result?.structuredContent).toMatchObject({ to: RECIPIENT, lamports: "1" });
  });

  test('still rejects "0" with a fully usable env', async () => {
    const result = await simulate("0");
    expect(result?.isError).toBe(true);
    expect(result?.structuredContent).toMatchObject({
      code: "ValidationError",
      field: "amountSol",
    });
  });

  test("ordinary positive decimals keep their exact precision", async () => {
    const lamports = await simulate("0.1");
    expect(lamports?.structuredContent).toMatchObject({ lamports: "100000000" });
  });
});
