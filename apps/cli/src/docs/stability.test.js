// @ts-check
import { describe, expect, test } from "bun:test";
import { liveValidatedActions, stabilityProblems } from "./stability.js";

const validated = liveValidatedActions([
  { status: "live-validated", action: "swap" },
  { status: "recorded", action: "open_perp" },
  { status: "live-validated" },
]);

describe("stability rule", () => {
  test("only live-validated rows with an action count", () => {
    expect([...validated]).toEqual(["swap"]);
  });

  test("a stable execute or simulate tool needs its Action live-validated; beta and read tools never do", () => {
    const tools = [
      { name: "solana_swap_execute_swap", tier: "execute", stability: "stable", action: "swap" },
      {
        name: "solana_perp_simulate_open",
        tier: "simulate",
        stability: "stable",
        action: "open_perp",
      },
      { name: "solana_launch_execute_buy", tier: "execute", stability: "beta", action: "swap" },
      { name: "solana_wallet_get_balance", tier: "read", stability: "stable" },
    ];
    expect(stabilityProblems(tools, validated)).toEqual([
      {
        tool: "solana_perp_simulate_open",
        reason:
          "solana_perp_simulate_open is stable but its Action open_perp has no live-validated row in features/feature-map.json",
        remedy: "record a funded round for that Action in the feature map, or label the tool beta",
      },
    ]);
  });
});
