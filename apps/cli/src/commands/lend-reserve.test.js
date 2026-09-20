// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { KLEND_PROGRAM_ID } from "@solos/solana";
import { ensureSurfnet, jsonRpc, randomSeed, seedAddress, USDC_MINT } from "@solos/solana/surfnet";
import { runSolos, solanaEnv, stderrJson } from "./cli-fixture.js";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {string} */
let absentMarket;
/** @type {string} */
let malformedMarket;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  absentMarket = await seedAddress(randomSeed());
  malformedMarket = await seedAddress(randomSeed());
  await jsonRpc(surfnet.rpcUrl, "surfnet_setAccount", [
    malformedMarket,
    { lamports: 1_000_000, data: "00", owner: KLEND_PROGRAM_ID, executable: false },
  ]);
});

describe("`solos lend reserve` and MCP configuration [integration]", () => {
  test("CLI rejects an invalid mint with a typed error before a reserve read", async () => {
    const result = await runSolos(["lend", "reserve", "--mint", "not-a-mint"], {
      ...(await solanaEnv(surfnet)),
      KAMINO_LENDING_MARKET: absentMarket,
    });
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(stderrJson(result.stderr)?.error).toMatchObject({
      code: "LendingInputInvalid",
    });
  });

  test("CLI reports the configured missing market without falling back", async () => {
    const result = await runSolos(["lend", "reserve", "--mint", USDC_MINT], {
      ...(await solanaEnv(surfnet)),
      KAMINO_LENDING_MARKET: absentMarket,
    });
    expect(result.code).not.toBe(0);
    expect(stderrJson(result.stderr)?.error).toMatchObject({
      code: "LendingMarketUnavailable",
      market: absentMarket,
    });
  });

  test("CLI classifies malformed market bytes as an unsupported layout", async () => {
    const result = await runSolos(["lend", "reserve", "--mint", USDC_MINT], {
      ...(await solanaEnv(surfnet)),
      KAMINO_LENDING_MARKET: malformedMarket,
    });
    expect(result.code).not.toBe(0);
    expect(stderrJson(result.stderr)?.error).toMatchObject({
      code: "LendingLayoutUnsupported",
      reserve: malformedMarket,
    });
  });

  test("MCP child receives KAMINO_LENDING_MARKET and returns the same typed failure", async () => {
    const result = await runSolos(
      ["mcp", "call", "solana_lend_get_reserve", "--args", JSON.stringify({ mint: USDC_MINT })],
      { ...(await solanaEnv(surfnet)), KAMINO_LENDING_MARKET: absentMarket },
    );
    expect(result.code).not.toBe(0);
    const response = JSON.parse(result.stdout);
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      code: "LendingMarketUnavailable",
      market: absentMarket,
    });
  });
});
