// @ts-check
import { describe, expect, test } from "bun:test";
import { RebalanceParamsSchema, USDC_MINT, WSOL_MINT } from "@solos-sh/actions";
import { evaluateRebalance } from "./rebalance-kind.js";
import { TickSchema } from "./tick.js";

const USDC = USDC_MINT;
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

/** @param {Record<string, unknown>} [patch] */
const params = (patch = {}) =>
  RebalanceParamsSchema.parse({
    targets: { [JUP]: "0.5", [USDT]: "0.2", [USDC]: "0.3" },
    bandBps: 100,
    minTradeUsd: "1",
    ...patch,
  });

/**
 * @param {Record<string, string>} balances
 * @param {Record<string, string>} [prices]
 */
const DEFAULT_PRICES = { [JUP]: "2", [USDT]: "1", [USDC]: "1" };

const seen = (balances, prices = DEFAULT_PRICES) => {
  /** @type {Record<string, string | number>} */
  const out = { instant: 1, priceAt: 1 };
  for (const [mint, amount] of Object.entries(balances)) {
    out[`balance:${mint}`] = amount;
    out[`decimals:${mint}`] = mint === WSOL_MINT ? 9 : 6;
    out[`price:${mint}`] = prices[mint] ?? "1";
    out[`priceAt:${mint}`] = 1;
  }
  return out;
};

/** @param {ReadonlyArray<{ inputMint: string; outputMint: string }>} actions */
const routesThrough = (actions, quote) =>
  actions.every(
    (action) =>
      (action.inputMint === quote || action.outputMint === quote) &&
      action.inputMint !== action.outputMint,
  );

describe("evaluateRebalance", () => {
  test("a wallet inside the band emits nothing and records weight, target, and drift", () => {
    const decision = evaluateRebalance(
      params(),
      seen({ [JUP]: "275000000", [USDT]: "220000000", [USDC]: "330000000" }),
      {},
    );
    expect(decision.actions).toEqual([]);
    expect(decision.note).toBe("all weights inside the band");
    expect(decision.state.mints?.[JUP]).toEqual({ weight: "0.5", target: "0.5", driftBps: 0 });
    expect(decision.state.mints?.[USDT]).toEqual({ weight: "0.2", target: "0.2", driftBps: 0 });
    expect(decision.state.mints?.[USDC]).toEqual({ weight: "0.3", target: "0.3", driftBps: 0 });
  });

  test("an overweight mint sells into the quote and an underweight mint buys from it, largest first", () => {
    const decision = evaluateRebalance(
      params(),
      seen({ [JUP]: "500000000", [USDT]: "0", [USDC]: "100000000" }),
      {},
    );
    expect(decision.actions.map((action) => action.type === "swap" && action.amount)).toEqual([
      "225000000",
      "220000000",
    ]);
    const [sell, buy] = /** @type {import("@solos-sh/actions").SwapAction[]} */ (decision.actions);
    expect(sell).toMatchObject({ inputMint: JUP, outputMint: USDC, maxSlippageBps: 50 });
    expect(buy).toMatchObject({ inputMint: USDC, outputMint: USDT, maxSlippageBps: 50 });
    expect(routesThrough(decision.actions, USDC)).toBe(true);
    expect(decision.state.mints?.[JUP]?.target).toBe("0.5");
    expect(decision.state.mints?.[JUP]?.driftBps).toBeGreaterThan(100);
    expect(decision.note).toBe("rebalance emits 2 swaps");
  });

  test("the quote mint absorbs the residual and equal notionals sell before they buy", () => {
    const decision = evaluateRebalance(
      params({ targets: { [JUP]: "0.5", [USDT]: "0.25", [USDC]: "0.25" }, minTradeUsd: "1" }),
      seen(
        { [JUP]: "300000000", [USDT]: "0", [USDC]: "100000000" },
        { [JUP]: "1", [USDT]: "1", [USDC]: "1" },
      ),
      {},
    );
    expect(decision.actions).toHaveLength(2);
    expect(decision.actions[0]).toMatchObject({
      inputMint: JUP,
      outputMint: USDC,
      amount: "100000000",
    });
    expect(decision.actions[1]).toMatchObject({
      inputMint: USDC,
      outputMint: USDT,
      amount: "100000000",
    });
    expect(decision.actions.some((action) => action.inputMint === action.outputMint)).toBe(false);
    expect(
      decision.actions.some((action) => action.inputMint !== USDC && action.outputMint !== USDC),
    ).toBe(false);
  });

  test("drops legs below minTradeUsd", () => {
    const decision = evaluateRebalance(
      params({ minTradeUsd: "300" }),
      seen({ [JUP]: "500000000", [USDT]: "0", [USDC]: "100000000" }),
      {},
    );
    expect(decision.actions).toEqual([
      expect.objectContaining({ inputMint: JUP, outputMint: USDC, amount: "225000000" }),
    ]);
    expect(decision.note).toBe("rebalance emits 1 swap");
  });

  test("a missing or non-positive price fails the tick, names the mint, and emits nothing", () => {
    const prior = { mints: { [JUP]: { weight: "0.5", target: "0.5", driftBps: 0 } } };
    const missing = evaluateRebalance(
      params(),
      seen(
        { [JUP]: "500000000", [USDT]: "0", [USDC]: "100000000" },
        { [JUP]: "2", [USDT]: "", [USDC]: "1" },
      ),
      prior,
    );
    expect(missing.actions).toEqual([]);
    expect(missing.failure?.reason).toBe(`missing price for ${USDT}`);
    expect(missing.state).toEqual(prior);
    const zero = evaluateRebalance(
      params(),
      seen({ [JUP]: "1", [USDT]: "1", [USDC]: "1" }, { [JUP]: "2", [USDT]: "0", [USDC]: "1" }),
      {},
    );
    expect(zero.failure?.reason).toBe(`missing price for ${USDT}`);
    expect(zero.actions).toEqual([]);
  });

  test("native SOL and wrapped SOL both count toward the wrapped mint", () => {
    const decision = evaluateRebalance(
      params({ targets: { [WSOL_MINT]: "0.5", [USDC]: "0.5" } }),
      {
        ...seen({ [WSOL_MINT]: "5000000000", [USDC]: "0" }, { [WSOL_MINT]: "100", [USDC]: "1" }),
        "balance:SOL": "5000000000",
      },
      {},
    );
    expect(decision.actions[0]).toMatchObject({
      inputMint: WSOL_MINT,
      outputMint: USDC,
      amount: "5000000000",
    });
  });

  test("a zero wallet emits nothing and still records the targets", () => {
    const decision = evaluateRebalance(
      params(),
      seen({ [JUP]: "0", [USDT]: "0", [USDC]: "0" }),
      {},
    );
    expect(decision.actions).toEqual([]);
    expect(decision.note).toBe("wallet value is zero");
    expect(decision.state.mints?.[JUP]?.weight).toBe("0");
    expect(decision.state.mints?.[JUP]?.target).toBe("0.5");
  });

  test("Tick state keeps trigger fields and rebalance weights", () => {
    const base = {
      tickId: "tick",
      strategyId: "strategy",
      dueAt: 1,
      startedAt: 1,
      finishedAt: 1,
      outcome: /** @type {const} */ ("evaluated"),
      observations: { instant: 1 },
      actions: [],
      intents: [],
    };
    expect(
      TickSchema.parse({
        ...base,
        state: { bestPriceUsd: "1.5", firedAt: 2, armed: { bestPriceUsd: "1" } },
      }).state?.bestPriceUsd,
    ).toBe("1.5");
    const weights = TickSchema.parse({
      ...base,
      state: { mints: { [JUP]: { weight: "0.5", target: "0.5", driftBps: 0 } } },
    });
    expect(weights.state?.mints?.[JUP]?.driftBps).toBe(0);
  });
});
