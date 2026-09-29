// @ts-check
import { describe, expect, test } from "bun:test";
import { localMatches } from "./local-match.js";

/** A small registry in the real naming scheme, so every expected ranking is worked by hand. */
const TOOLS = [
  {
    name: "solana_swap_execute_swap",
    group: "swap",
    title: "Execute a Jupiter swap",
    description: "Swap tokens through Jupiter and wait for confirmation.",
  },
  {
    name: "solana_swap_get_quote",
    group: "swap",
    title: "Get a swap quote",
    description: "An indicative Jupiter quote; nothing is sent.",
  },
  {
    name: "solana_wallet_get_balance",
    group: "wallet",
    title: "Get wallet balances",
    description: "SOL and token balances, useful before a swap.",
  },
  {
    name: "solana_launch_get_curve",
    group: "launch",
    title: "Get bonding curve state",
    description: "Read one pump.fun curve.",
  },
  {
    name: "solana_lend_simulate_deposit",
    group: "lend",
    title: "Simulate a lend deposit",
    description: "Preview supplying tokens to Kamino.",
  },
  {
    name: "solana_perp_get_position",
    group: "perp",
    title: "Get a perp position",
    description: "Read one Phoenix position.",
  },
  {
    name: "solana_perp_simulate_open",
    group: "perp",
    title: "Preview an IOC open",
    description: "Bounded Phoenix order preview.",
  },
];

const names = (query) => localMatches(query, TOOLS).map((match) => match.name);

describe("the local tool matcher", () => {
  test("a name or group hit outranks a description hit, and equal scores order by name", () => {
    expect(names("swap SOL for USDC")).toEqual([
      "solana_swap_execute_swap",
      "solana_swap_get_quote",
      "solana_wallet_get_balance",
    ]);
  });

  test("a title word the name does not carry still matches", () => {
    expect(names("bonding")).toEqual(["solana_launch_get_curve"]);
  });

  test("a description word matches, below a word in the name", () => {
    const matches = localMatches("kamino deposit", TOOLS);
    expect(matches.map((match) => match.name)).toEqual(["solana_lend_simulate_deposit"]);
    expect(matches[0]?.score).toBeCloseTo(4 / 6);
  });

  test("a group name selects every tool in the group", () => {
    expect(names("perp")).toEqual(["solana_perp_get_position", "solana_perp_simulate_open"]);
  });

  test("case, punctuation, plurals and filler words do not change the match", () => {
    expect(names("What's my WALLET balance?")).toEqual(["solana_wallet_get_balance"]);
    expect(localMatches("wallet balances", TOOLS)[0]).toEqual({
      name: "solana_wallet_get_balance",
      score: 1,
    });
  });

  test("the solana prefix every tool shares carries no signal", () => {
    expect(names("solana")).toEqual([]);
  });

  test("a query no tool mentions matches nothing", () => {
    expect(names("weather forecast tomorrow")).toEqual([]);
    expect(names("what is the")).toEqual([]);
  });
});
