// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet, randomSeed, seedAddress, USDC_MINT } from "@solos/solana/surfnet";
import { runSolos, solanaEnv, stderrJson } from "./cli-fixture.js";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {string} */
let absentMarket;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  absentMarket = await seedAddress(randomSeed());
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
