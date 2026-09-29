// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { allTools, selectTools } from "@solos/core";
import { Effect } from "effect";
import { BODY_MARKER, KEY, jevAnswer, startGateway } from "./ai-gateway-fixture.js";
import { JevToolSelectorLive } from "./jev-tool-selector.js";

/** @type {Array<() => void>} */
const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** @param {Parameters<typeof startGateway>[0]} responses */
const gateway = (responses) => {
  const fixture = startGateway(responses);
  stops.push(fixture.stop);
  return fixture;
};

/**
 * @param {{ baseUrl: string; apiKey?: string }} config
 * @param {{ query: string; timeoutMs?: number }} input
 */
const select = (config, input) =>
  Effect.runPromise(
    selectTools({ ...input, tools: allTools }).pipe(Effect.provide(JevToolSelectorLive(config))),
  );

describe("free-text tool selection with JEV through the AI Gateway [integration]", () => {
  test("with a key, JEV ranks the registry and the selection says JEV ranked it", async () => {
    const fixture = gateway([
      {
        body: jevAnswer({
          solana_swap_execute_swap: 0.93,
          solana_swap_simulate_swap: 0.05,
          solana_swap_get_quote: 0.02,
          solana_wallet_get_balance: 0,
        }),
      },
    ]);
    const selection = await select(
      { baseUrl: fixture.baseUrl, apiKey: KEY },
      { query: "swap SOL for USDC" },
    );
    expect(selection).toEqual({
      query: "swap SOL for USDC",
      selector: "jev",
      matches: [
        { name: "solana_swap_execute_swap", score: 0.93 },
        { name: "solana_swap_simulate_swap", score: 0.05 },
        { name: "solana_swap_get_quote", score: 0.02 },
      ],
      matched: 3,
    });
    const [request] = fixture.requests;
    expect(request?.path).toBe("/v4/ai/evaluation-model");
    expect(request?.modelId).toBe("typesafe-ai/jev");
    expect(request?.authorization).toBe(`Bearer ${KEY}`);
    expect(request?.body.state).toEqual({ query: "swap SOL for USDC" });
    // Every tool is an option, described by its title alone: measured on 2026-09-28, adding
    // descriptions cost 5.4 times the input tokens and picked the same tools.
    expect(request?.body.questions.tool.criteria).toEqual(
      Object.fromEntries(allTools.map((tool) => [tool.name, tool.title])),
    );
    expect(request?.body.providerOptions.gateway.order[0]).toBe("typesafe-ai");
  });

  test("with no key, selection falls back to the local matcher, says why, and sends nothing", async () => {
    const fixture = gateway([]);
    const selection = await select({ baseUrl: fixture.baseUrl }, { query: "swap SOL for USDC" });
    expect(selection.selector).toBe("local");
    expect(selection.fallback).toContain("AI_GATEWAY_API_KEY is not set");
    expect(selection.matches[0]?.name).toBe("solana_swap_execute_swap");
    expect(fixture.requests).toHaveLength(0);
  });

  test("when the gateway fails, selection falls back locally and carries none of its words", async () => {
    const fixture = gateway([
      { status: 503, body: { error: { message: BODY_MARKER, type: "service_unavailable" } } },
    ]);
    const selection = await select(
      { baseUrl: fixture.baseUrl, apiKey: KEY },
      { query: "swap SOL for USDC" },
    );
    expect(selection.selector).toBe("local");
    expect(selection.fallback).toBe(
      "the JEV request failed (HTTP 503), so the request was matched locally",
    );
    expect(JSON.stringify(selection)).not.toContain(BODY_MARKER);
    expect(fixture.requests).toHaveLength(1);
  });

  test("when JEV does not answer in time, selection falls back locally within the bound", async () => {
    const fixture = gateway([{ delayMs: 2000, body: jevAnswer({ solana_wallet_get_balance: 1 }) }]);
    const started = Date.now();
    const selection = await select(
      { baseUrl: fixture.baseUrl, apiKey: KEY },
      { query: "swap SOL for USDC", timeoutMs: 200 },
    );
    expect(Date.now() - started).toBeLessThan(1000);
    expect(selection.selector).toBe("local");
    expect(selection.fallback).toBe(
      "the jev selector did not answer within 200 ms, so the request was matched locally",
    );
    expect(selection.matches[0]?.name).toBe("solana_swap_execute_swap");
  });

  test("an answer that skips the tool question falls back locally", async () => {
    const fixture = gateway([{ body: { ...jevAnswer({}), answers: {} } }]);
    const selection = await select(
      { baseUrl: fixture.baseUrl, apiKey: KEY },
      { query: "swap SOL for USDC" },
    );
    expect(selection.selector).toBe("local");
    expect(selection.fallback).toBe(
      "JEV answered without choosing a known tool, so the request was matched locally",
    );
  });
  test("an empty probability map still ranks the chosen tool", async () => {
    const answer = jevAnswer({});
    answer.answers.tool = {
      type: "choice",
      choice: "solana_wallet_get_balance",
      probabilities: {},
    };
    const fixture = gateway([{ body: answer }]);
    const selection = await select(
      { baseUrl: fixture.baseUrl, apiKey: KEY },
      { query: "what is my balance" },
    );
    expect(selection).toMatchObject({
      selector: "jev",
      matches: [{ name: "solana_wallet_get_balance", score: 1 }],
      matched: 1,
    });
  });

  test("an answer naming only unknown tools falls back locally", async () => {
    const fixture = gateway([{ body: jevAnswer({ not_a_tool: 0.9, nor_this: 0.1 }) }]);
    const selection = await select(
      { baseUrl: fixture.baseUrl, apiKey: KEY },
      { query: "swap SOL for USDC" },
    );
    expect(selection.selector).toBe("local");
    expect(selection.fallback).toBe(
      "JEV answered without choosing a known tool, so the request was matched locally",
    );
    expect(selection.matches[0]?.name).toBe("solana_swap_execute_swap");
  });
});
