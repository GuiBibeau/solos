// @ts-check
import { expect, test } from "bun:test";
import { perpTools } from "../index.js";

const names = ["solana_perp_simulate_open", "solana_perp_execute_open"];
const valid = {
  market: "SOL",
  side: "long",
  notionalUsd: "1000000",
  maxLeverage: 2,
  limitPriceUsd: "150.25",
};

test("Phoenix IOC open tools require an exact bounded intent and expose simulate/execute twins", () => {
  for (const name of names) {
    const tool = perpTools.find((entry) => entry.name === name);
    expect(tool?.input.safeParse(valid).success).toBe(true);
    expect(tool?.input.safeParse({ ...valid, market: "SOL-PERP" }).success).toBe(true);
    for (const [field, value] of [
      ["notionalUsd", "0"],
      ["notionalUsd", "1e6"],
      ["maxLeverage", 101],
      ["maxLeverage", 1.5],
      ["market", "SOL/USDC"],
      ["market", "a"],
      ["limitPriceUsd", "0"],
      ["limitPriceUsd", "1".repeat(41)],
      ["limitPriceUsd", undefined],
      ["side", "flat"],
    ]) {
      expect(tool?.input.safeParse({ ...valid, [field]: value }).success).toBe(false);
    }
    expect(tool?.input.safeParse({ ...valid, traderPdaIndex: 1 }).success).toBe(false);
  }
});
