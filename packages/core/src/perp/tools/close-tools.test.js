// @ts-check
import { expect, test } from "bun:test";
import { perpTools } from "../index.js";

const names = ["solana_perp_simulate_close", "solana_perp_execute_close"];
const valid = { market: "SOL", limitPriceUsd: "115.25" };

test("Phoenix reduce-only close twins accept finite limits and reject malformed input", () => {
  for (const name of names) {
    const tool = perpTools.find((entry) => entry.name === name);
    expect(tool?.input.safeParse(valid).success).toBe(true);
    expect(tool?.input.safeParse({ ...valid, market: "SOL-PERP" }).success).toBe(true);
    for (const [field, value] of [
      ["market", "SOL/USDC"],
      ["limitPriceUsd", "0"],
      ["limitPriceUsd", undefined],
      ["limitPriceUsd", "-1"],
    ])
      expect(tool?.input.safeParse({ ...valid, [field]: value }).success).toBe(false);
    expect(tool?.input.safeParse({ ...valid, traderPdaIndex: 1 }).success).toBe(false);
  }
});
