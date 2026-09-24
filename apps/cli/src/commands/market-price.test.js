// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { runSolos, solanaEnv, stderrJson } from "./cli-fixture.js";

const KEY = "test-jupiter-key";
const MINT = "So11111111111111111111111111111111111111112";
const PRICE = 100.46852810203305;

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {{ requests: Array<{ key: string | undefined; ids: string | undefined }>; url: string; stop: () => void }} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      requests.push({
        key: request.headers.get("x-api-key") ?? undefined,
        ids: new URL(request.url).searchParams.get("ids") ?? undefined,
      });
      return Response.json({ [MINT]: { usdPrice: PRICE, blockId: 4815, decimals: 9 } });
    },
  });
  fixture = { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
});

afterAll(() => fixture?.stop());

describe("`solos market price` and `solos mcp` through real child processes [integration]", () => {
  test("market price prints the contract JSON and reaches the loopback fixture", async () => {
    const { stdout, code } = await runSolos(["market", "price", "--mint", MINT], {
      ...(await solanaEnv(surfnet)),
      JUPITER_API_KEY: KEY,
      JUPITER_BASE_URL: fixture.url,
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      mint: MINT,
      priceUsd: String(PRICE),
      source: "jupiter",
      at: expect.any(Number),
    });
    expect(fixture.requests).toEqual([{ key: KEY, ids: MINT }]);
  });

  test("mcp call returns the matching price through the real server child", async () => {
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_market_get_price", "--args", JSON.stringify({ mint: MINT })],
      { ...(await solanaEnv(surfnet)), JUPITER_API_KEY: KEY, JUPITER_BASE_URL: fixture.url },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      mint: MINT,
      priceUsd: String(PRICE),
      source: "jupiter",
    });
    expect(fixture.requests.length).toBe(before + 1);
  });

  test("mcp list without a key still advertises every tool, price included", async () => {
    const { stdout, code } = await runSolos(["mcp", "list"], await solanaEnv(surfnet));
    expect(code).toBe(0);
    const names = JSON.parse(stdout).tools.map((/** @type {{ name: string }} */ t) => t.name);
    expect(names).toEqual([
      "solana_launch_get_curve",
      "solana_lend_execute_deposit",
      "solana_lend_execute_withdraw",
      "solana_lend_get_position",
      "solana_lend_get_reserve",
      "solana_lend_simulate_deposit",
      "solana_lend_simulate_withdraw",
      "solana_liquidity_execute_deposit",
      "solana_liquidity_execute_withdraw",
      "solana_liquidity_get_position",
      "solana_liquidity_simulate_deposit",
      "solana_liquidity_simulate_withdraw",
      "solana_market_ask_iris",
      "solana_market_get_event_summary",
      "solana_market_get_price",
      "solana_market_get_token",
      "solana_market_get_token_news",
      "solana_market_get_trending_tokens",
      "solana_perp_execute_deposit_collateral",
      "solana_perp_execute_onboard_trader",
      "solana_perp_execute_open",
      "solana_perp_execute_withdraw_collateral",
      "solana_perp_get_onboarding_status",
      "solana_perp_get_position",
      "solana_perp_simulate_deposit_collateral",
      "solana_perp_simulate_onboard_trader",
      "solana_perp_simulate_open",
      "solana_perp_simulate_withdraw_collateral",
      "solana_portfolio_get_state",
      "solana_swap_execute_swap",
      "solana_swap_get_quote",
      "solana_swap_simulate_swap",
      "solana_transfer_send_sol",
      "solana_transfer_simulate_sol",
      "solana_wallet_get_address",
      "solana_wallet_get_balance",
    ]);
  });

  test("market price without a key exits 1 with the tagged error, before provider access", async () => {
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await runSolos(["market", "price", "--mint", MINT], {
      ...(await solanaEnv(surfnet)),
      JUPITER_BASE_URL: fixture.url,
    });
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "PriceConfigMissing" });
    expect(fixture.requests.length).toBe(before);
  });

  test("mcp call without a parent key returns a structured tool error", async () => {
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_market_get_price", "--args", JSON.stringify({ mint: MINT })],
      { ...(await solanaEnv(surfnet)), JUPITER_BASE_URL: fixture.url },
    );
    expect(code).not.toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "PriceConfigMissing" });
    expect(fixture.requests.length).toBe(before);
  });
});
