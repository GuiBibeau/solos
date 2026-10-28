// @ts-check
import { describe, expect, test } from "bun:test";
import { RebalanceParamsSchema, StrategyDraftSchema, StrategySchema, USDC_MINT } from "./index.js";

const USDC = USDC_MINT;
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const bounds = (allowedMints = /** @type {string[]} */ ([])) => ({
  maxNotionalPerTickUsd: "1000",
  maxDailySpendUsd: "5000",
  allowedMints,
  expiresAt: null,
  maxConsecutiveFailures: 2,
});

/** @param {Record<string, unknown>} [patch] */
const draft = (patch = {}) => ({
  owner: "swarm",
  kind: "rebalance",
  params: {
    targets: { [JUP]: "0.5", [USDC]: "0.5" },
    bandBps: 300,
    minTradeUsd: "1",
  },
  tickSource: { type: "clock", every: 60_000 },
  bounds: bounds(),
  ...patch,
});

/** @param {unknown} value */
const messages = (value) => {
  const parsed = StrategyDraftSchema.safeParse(value);
  if (parsed.success) return "";
  return parsed.error.issues.map((issue) => issue.message).join(" ");
};

describe("RebalanceParamsSchema", () => {
  test("defaults the quote mint and slippage and describes every field", () => {
    const parsed = RebalanceParamsSchema.parse({
      targets: { [JUP]: "0.5", [USDC]: "0.5" },
      bandBps: 300,
      minTradeUsd: "1",
    });
    expect(parsed.quoteMint).toBe(USDC);
    expect(parsed.maxSlippageBps).toBe(50);
    expect((RebalanceParamsSchema.description ?? "").length).toBeGreaterThan(10);
    const stored = StrategySchema.parse({
      ...draft(),
      schemaVersion: 1,
      id: ID,
      state: "active",
      createdAt: 0,
      expiresAt: null,
    });
    expect(stored.kind).toBe("rebalance");
    expect(stored.params.quoteMint).toBe(USDC);
  });

  test("rejects a bad sum, a single target, a weight outside (0, 1), and a quote target without one", () => {
    expect(
      messages(
        draft({
          params: { targets: { [JUP]: "0.5", [USDC]: "0.6" }, bandBps: 1, minTradeUsd: "1" },
        }),
      ),
    ).toContain("weights must sum to 1");
    expect(
      messages(draft({ params: { targets: { [JUP]: "1" }, bandBps: 1, minTradeUsd: "1" } })),
    ).toContain("at least two target mints");
    expect(
      messages(
        draft({
          params: { targets: { [JUP]: "0", [USDC]: "1" }, bandBps: 1, minTradeUsd: "1" },
        }),
      ),
    ).toContain("positive decimal in (0, 1)");
    expect(
      messages(
        draft({
          params: {
            targets: { [JUP]: "0.5", [USDC]: "0" },
            bandBps: 1,
            quoteMint: USDC,
            minTradeUsd: "1",
          },
        }),
      ),
    ).toContain("quote mint repeated as a target");
    expect(
      messages(
        draft({
          params: { targets: { [JUP]: "0.5", [USDT]: "0.5" }, bandBps: 5001, minTradeUsd: "1" },
        }),
      ),
    ).toContain("5000");
    expect(
      messages(
        draft({
          params: { targets: { [JUP]: "0.5", [USDT]: "0.5" }, bandBps: 1, minTradeUsd: "0" },
        }),
      ),
    ).toContain("minTradeUsd must be greater than 0");
  });

  test("accepts a sum within 1e-6 and requires the quote mint on a non-empty allowlist", () => {
    const close = StrategyDraftSchema.parse(
      draft({
        params: {
          targets: { [JUP]: "0.5", [USDC]: "0.500001" },
          bandBps: 1,
          minTradeUsd: "0.01",
        },
      }),
    );
    expect(close.kind).toBe("rebalance");
    expect(
      messages(
        draft({
          params: {
            targets: { [JUP]: "0.5", [USDC]: "0.500002" },
            bandBps: 1,
            minTradeUsd: "1",
          },
        }),
      ),
    ).toContain("weights must sum to 1");
    expect(messages(draft({ bounds: bounds([JUP]) }))).toContain(
      `mint ${USDC} must be in bounds.allowedMints`,
    );
    const allowed = StrategyDraftSchema.parse(draft({ bounds: bounds([JUP, USDC]) }));
    expect(allowed.bounds.allowedMints).toEqual([JUP, USDC]);
    expect(messages(draft({ bounds: bounds([JUP, USDT]) }))).toContain(USDC);
  });
});
