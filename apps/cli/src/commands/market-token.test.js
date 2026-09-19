// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { seedTokenFixtures } from "@solos/solana/market/test-seeds";
import { ensureSurfnet, USDC_MINT } from "@solos/solana/surfnet";
import { runSolos, solanaEnv } from "./cli-fixture.js";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {Awaited<ReturnType<typeof seedTokenFixtures>>} */
let fx;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fx = await seedTokenFixtures(surfnet.rpcUrl, USDC_MINT);
});

describe("`solos market token` and `solos mcp` through real child processes [integration]", () => {
  test("market token prints verified metadata read from the configured RPC endpoint", async () => {
    const { stdout, code } = await runSolos(["market", "token", "--mint", fx.classicWithMetaplex], {
      ...(await solanaEnv(surfnet)),
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      mint: fx.classicWithMetaplex,
      name: "Fixture Dog",
      symbol: "FDOG",
      decimals: 6,
      logoUri: null,
    });
  });

  test("mcp call returns token-2022 metadata with its on-chain logo through the server child", async () => {
    const { stdout, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.token2022WithExtension }),
      ],
      { ...(await solanaEnv(surfnet)) },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      mint: fx.token2022WithExtension,
      name: "Fixture Cat",
      symbol: "FCAT",
      decimals: 8,
      logoUri: "https://fixture.example/cat.png",
    });
  });

  test("a mint shaped exactly like a real extended chain mint reads through MCP", async () => {
    const { stdout, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.token2022RealShape }),
      ],
      { ...(await solanaEnv(surfnet)) },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      mint: fx.token2022RealShape,
      name: "Fixture Cat",
      symbol: "FCAT",
      decimals: 6,
      logoUri: "https://fixture.example/real.png",
    });
  });

  test("a tail-padding token-2022 mint reads through the Metaplex fallback on the CLI", async () => {
    const expected = {
      mint: fx.token2022TailPadding,
      name: "Fixture Owl",
      symbol: "FOWL",
      decimals: 6,
      logoUri: null,
    };
    const cli = await runSolos(["market", "token", "--mint", fx.token2022TailPadding], {
      ...(await solanaEnv(surfnet)),
    });
    expect(cli.code).toBe(0);
    expect(JSON.parse(cli.stdout)).toEqual(expected);
  });

  test("a tail-padding token-2022 mint reads through the Metaplex fallback through MCP", async () => {
    const expected = {
      mint: fx.token2022TailPadding,
      name: "Fixture Owl",
      symbol: "FOWL",
      decimals: 6,
      logoUri: null,
    };
    const mcp = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.token2022TailPadding }),
      ],
      { ...(await solanaEnv(surfnet)) },
    );
    expect(mcp.code).toBe(0);
    const result = JSON.parse(mcp.stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(expected);
  });
});
