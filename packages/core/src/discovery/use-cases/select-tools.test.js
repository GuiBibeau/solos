// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { ToolSelector } from "../ports/tool-selector.js";
import { selectTools } from "./select-tools.js";

const TOOLS = [
  {
    name: "solana_swap_execute_swap",
    group: "swap",
    title: "Execute a Jupiter swap",
    description: "Swap tokens through Jupiter and wait for confirmation.",
  },
  {
    name: "solana_wallet_get_balance",
    group: "wallet",
    title: "Get wallet balances",
    description: "SOL and token balances, useful before a swap.",
  },
];

/** A selector that counts how often it is asked and ranks every tool equally. */
const counting = () => {
  let asked = 0;
  const layer = Layer.succeed(ToolSelector, {
    name: "stub",
    select: ({ tools }) => {
      asked += 1;
      return Effect.succeed(tools.map((tool) => ({ name: tool.name, score: 0.5 })));
    },
  });
  return { layer, asked: () => asked };
};

/** @param {{ limit?: number; timeoutMs?: number }} bounds */
const refused = async (bounds) => {
  const stub = counting();
  const error = await Effect.runPromise(
    selectTools({ query: "swap", tools: TOOLS, ...bounds }).pipe(
      Effect.flip,
      Effect.provide(stub.layer),
    ),
  );
  return { error, asked: stub.asked() };
};

describe("selectTools bounds", () => {
  test("a negative limit is refused before any selector runs", async () => {
    const { error, asked } = await refused({ limit: -1 });
    expect(error).toMatchObject({
      _tag: "SelectionInputInvalid",
      reason: "limit must be a whole number of matches, zero or more",
    });
    expect(asked).toBe(0);
  });

  test("a fractional limit is refused", async () => {
    const { error } = await refused({ limit: 2.5 });
    expect(error._tag).toBe("SelectionInputInvalid");
  });

  test("a timeout below one millisecond is refused", async () => {
    const { error, asked } = await refused({ timeoutMs: 0 });
    expect(error).toMatchObject({
      _tag: "SelectionInputInvalid",
      reason: "timeoutMs must be a whole number of milliseconds, one or more",
    });
    expect(asked).toBe(0);
  });

  test("a limit of zero lists nothing and still counts every match", async () => {
    const stub = counting();
    const selection = await Effect.runPromise(
      selectTools({ query: "swap", tools: TOOLS, limit: 0 }).pipe(Effect.provide(stub.layer)),
    );
    expect(selection).toEqual({ query: "swap", selector: "stub", matches: [], matched: 2 });
    expect(stub.asked()).toBe(1);
  });
});
