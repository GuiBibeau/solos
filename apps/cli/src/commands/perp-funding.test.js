// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fundingMarket } from "@solos/solana/perp/phoenix-scenarios";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { runSolos, stderrJson } from "./cli-fixture.js";
import { signerEnv, startPerpFixture } from "./perp-fixture.js";

const HOUR = 3600;
const second = Math.floor(Date.now() / 1000);
const iso = (/** @type {number} */ sec) => new Date(sec * 1000).toISOString();

const solSnapshot = {
  market: "SOL-PERP",
  at: iso(second),
  rateHourlyPct: "0.003",
  aprPct: "26.28",
  nextFundingAt: iso(second + HOUR),
  history: [
    { at: iso(second - 2 * HOUR), rateHourlyPct: "0.001" },
    { at: iso(second - HOUR), rateHourlyPct: "0.002" },
    { at: iso(second), rateHourlyPct: "0.003" },
  ],
};

const ethSnapshot = {
  market: "ETH-PERP",
  at: iso(second),
  rateHourlyPct: "-0.004",
  aprPct: "-35.04",
  nextFundingAt: iso(second + HOUR),
  history: [],
};

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startPerpFixture>} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fixture = startPerpFixture({
    market: { SOL: fundingMarket("SOL", second), ETH: fundingMarket("ETH", second) },
    funding: {
      SOL: {
        rates: [
          { timestamp: second - 25 * HOUR, fundingRatePercentage: "9" },
          { timestamp: second - 2 * HOUR, fundingRatePercentage: "0.001" },
          { timestamp: second - HOUR, fundingRatePercentage: "0.002" },
          { timestamp: second, fundingRatePercentage: "0.003" },
        ],
      },
      ETH: { rates: [], fundingRatePercentage: "-0.004", timestamp: second },
    },
  });
});

afterAll(() => fixture?.stop());

/** @param {Record<string, string>} env @param {string[]} args */
const cli = (env, args) => runSolos(args, env);

describe("`solos perp funding` and stdio MCP against the loopback fixture [integration]", () => {
  test("a market with history prints the hourly rate, the APR and the in-window series", async () => {
    const { env } = await signerEnv(surfnet, fixture.url);
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await cli(env, [
      "perp",
      "funding",
      "--market",
      "SOL-PERP",
      "--lookback-hours",
      "24",
    ]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual(solSnapshot);
    const seen = fixture.requests.slice(before);
    expect(seen.map((entry) => entry.path)).toEqual([
      "/v1/view/exchange/market/SOL",
      "/v1/funding/SOL/rates",
    ]);
    expect(seen[1]?.query).toMatchObject({ limit: "26" });
  });

  test("mcp call returns the same history snapshot through the real server child", async () => {
    const { env } = await signerEnv(surfnet, fixture.url);
    const { stdout, code } = await cli(env, [
      "mcp",
      "call",
      "solana_perp_get_funding",
      "--args",
      JSON.stringify({ market: "SOL-PERP", lookbackHours: 24 }),
    ]);
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(solSnapshot);
  });

  test("a market with only the current rate returns an empty history on both surfaces", async () => {
    const { env } = await signerEnv(surfnet, fixture.url);
    const command = await cli(env, ["perp", "funding", "--market", "ETH"]);
    expect(command.code).toBe(0);
    expect(JSON.parse(command.stdout)).toEqual(ethSnapshot);
    const call = await cli(env, [
      "mcp",
      "call",
      "solana_perp_get_funding",
      "--args",
      JSON.stringify({ market: "ETH-PERP" }),
    ]);
    expect(call.code).toBe(0);
    expect(JSON.parse(call.stdout).structuredContent).toEqual(ethSnapshot);
  });

  test("an unknown market is PerpMarketUnknown with a reason and a remedy", async () => {
    const { env } = await signerEnv(surfnet, fixture.url);
    const command = await cli(env, ["perp", "funding", "--market", "DOGE"]);
    expect(command.code).not.toBe(0);
    expect(command.stdout).toBe("");
    expect(stderrJson(command.stderr)?.error).toMatchObject({
      code: "PerpMarketUnknown",
      market: "DOGE",
      reason: expect.stringContaining("DOGE"),
      remedy: expect.stringContaining("SOL-PERP"),
    });
    const call = await cli(env, [
      "mcp",
      "call",
      "solana_perp_get_funding",
      "--args",
      JSON.stringify({ market: "DOGE" }),
    ]);
    expect(call.code).not.toBe(0);
    expect(JSON.parse(call.stdout).isError).toBe(true);
    expect(JSON.parse(call.stdout).structuredContent).toMatchObject({
      code: "PerpMarketUnknown",
      reason: expect.stringContaining("DOGE"),
      remedy: expect.stringContaining("SOL-PERP"),
    });
  });

  test("a provider that does not answer is PerpNetworkError with a reason and a remedy", async () => {
    const down = startPerpFixture();
    const url = down.url;
    down.stop();
    const { env } = await signerEnv(surfnet, url);
    const command = await cli(env, ["perp", "funding", "--market", "SOL-PERP"]);
    expect(command.code).not.toBe(0);
    expect(stderrJson(command.stderr)?.error).toMatchObject({
      code: "PerpNetworkError",
      reason: expect.any(String),
      remedy: expect.stringContaining("PHOENIX_BASE_URL"),
    });
    const call = await cli(env, [
      "mcp",
      "call",
      "solana_perp_get_funding",
      "--args",
      JSON.stringify({ market: "SOL" }),
    ]);
    expect(call.code).not.toBe(0);
    expect(JSON.parse(call.stdout).structuredContent).toMatchObject({
      code: "PerpNetworkError",
      reason: expect.any(String),
      remedy: expect.any(String),
    });
  });
});
