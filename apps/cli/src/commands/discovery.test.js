// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { KEY, jevAnswer, startGateway } from "@solos/solana/discovery/ai-gateway-fixture";
import { runSolos } from "./transfer-fixture.js";

/** @type {Array<() => void>} */
const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** @param {Record<string, string>} env */
const select = async (env) => {
  const cli = await runSolos(["discovery", "select", "--query", "swap SOL for USDC"], env);
  return { code: cli.code, selection: JSON.parse(cli.stdout) };
};

describe("`solos discovery select` [integration]", () => {
  test("with no gateway key, the command matches locally and says so, without an RPC URL", async () => {
    const { code, selection } = await select({});
    expect(code).toBe(0);
    expect(selection.selector).toBe("local");
    expect(selection.fallback).toContain("AI_GATEWAY_API_KEY is not set");
    expect(selection.matches[0].name).toBe("solana_swap_execute_swap");
  });

  test("with a gateway key, the command ranks the registry with JEV", async () => {
    const fixture = startGateway([{ body: jevAnswer({ solana_swap_simulate_swap: 1 }) }]);
    stops.push(fixture.stop);
    const { code, selection } = await select({
      AI_GATEWAY_API_KEY: KEY,
      AI_GATEWAY_BASE_URL: fixture.baseUrl,
    });
    expect(code).toBe(0);
    expect(selection).toMatchObject({
      selector: "jev",
      matches: [{ name: "solana_swap_simulate_swap", score: 1 }],
      matched: 1,
    });
    expect(fixture.requests).toHaveLength(1);
  });
});
