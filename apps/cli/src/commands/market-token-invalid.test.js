// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { seedTokenFixtures, setClassicMint, WSOL_MINT } from "@solos/solana/market/test-seeds";
import { ensureSurfnet, USDC_MINT } from "@solos/solana/surfnet";
import { runSolos, solanaEnv, stderrJson } from "./cli-fixture.js";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {Awaited<ReturnType<typeof seedTokenFixtures>>} */
let fx;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fx = await seedTokenFixtures(surfnet.rpcUrl, USDC_MINT);
});

describe("`solos market token` invalid mints and unreadable metadata [integration]", () => {
  test("a token account passed as a mint exits 1 with UnknownToken, never metadata", async () => {
    const { stdout, stderr, code } = await runSolos(
      ["market", "token", "--mint", fx.tokenAccountAsMint],
      {
        ...(await solanaEnv(surfnet)),
      },
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "UnknownToken",
      mint: fx.tokenAccountAsMint,
    });
  });

  test("absent metadata on a valid mint is a structured TokenMetadataUnavailable through MCP", async () => {
    const { stdout, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.bareClassic }),
      ],
      { ...(await solanaEnv(surfnet)) },
    );
    expect(code).not.toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "TokenMetadataUnavailable",
      mint: fx.bareClassic,
    });
  });

  test("wSOL with wrong on-chain decimals never maps canonically, through the CLI", async () => {
    await setClassicMint(surfnet.rpcUrl, WSOL_MINT, 6);
    const { stderr, code } = await runSolos(["market", "token", "--mint", WSOL_MINT], {
      ...(await solanaEnv(surfnet)),
    });
    expect(code).not.toBe(0);
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "TokenMetadataUnavailable" });
    await setClassicMint(surfnet.rpcUrl, WSOL_MINT, 9);
  });
});
