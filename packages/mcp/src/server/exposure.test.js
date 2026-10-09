// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { z } from "zod";
import { buildInstructions } from "./instructions.js";
import { filterByExposure } from "./register-tools.js";

/** @type {import("@solos/core").AnyToolDefinition[]} */
const tools = [
  {
    name: "solana_wallet_get_balance",
    group: "wallet",
    tier: "read",
    stability: "beta",
    title: "Get wallet balance",
    description: "SOL and token balances of one wallet, read from the chain.",
    input: z.object({}),
    run: () => Effect.succeed({}),
  },
  {
    name: "solana_swap_simulate_route",
    group: "swap",
    tier: "simulate",
    stability: "experimental",
    action: "swap",
    title: "Simulate a routed swap",
    description: "Preview a swap across several venues; nothing is sent.",
    input: z.object({}),
    run: () => Effect.succeed({}),
  },
  {
    name: "solana_swap_execute_swap",
    group: "swap",
    tier: "execute",
    stability: "stable",
    action: "swap",
    title: "Execute swap",
    description: "Swap tokens through Jupiter and wait for confirmation of the transaction.",
    input: z.object({}),
    run: () => Effect.succeed({}),
  },
];

/** @param {{ ceiling: "read" | "simulate" | "execute"; experimental: boolean }} exposure */
const names = (exposure) => filterByExposure(tools, exposure).map((tool) => tool.name);

describe("exposure by tier ceiling and feature flag (ADR-0036)", () => {
  test("an experimental tool is offered only when the flag is on, and never above the ceiling", () => {
    expect(names({ ceiling: "simulate", experimental: false })).toEqual([
      "solana_wallet_get_balance",
    ]);
    expect(names({ ceiling: "simulate", experimental: true })).toEqual([
      "solana_wallet_get_balance",
      "solana_swap_simulate_route",
    ]);
    expect(names({ ceiling: "read", experimental: true })).toEqual(["solana_wallet_get_balance"]);
  });

  test("the instructions mark a withheld experimental tool and say how to enable it", () => {
    const withheld = buildInstructions(tools, { ceiling: "execute", experimental: false });
    expect(withheld).toContain(
      "Experimental tools are withheld here and marked unavailable below; the Operator enables them with --features experimental.",
    );
    expect(withheld).toContain(
      "solana_swap_simulate_route — Simulate a routed swap (unavailable: experimental; the Operator enables it with --features experimental)",
    );
    expect(withheld).toContain("solana_swap_execute_swap — Execute swap\n");
    const enabled = buildInstructions(tools, { ceiling: "execute", experimental: true });
    expect(enabled).not.toContain("Experimental tools are withheld");
    expect(enabled).toContain("solana_swap_simulate_route — Simulate a routed swap\n");
  });

  test("a registry without experimental tools says nothing about them", () => {
    const plain = buildInstructions(tools.slice(0, 1), {
      ceiling: "simulate",
      experimental: false,
    });
    expect(plain).not.toContain("Experimental tools");
  });
});
