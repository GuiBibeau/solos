// @ts-check
/**
 * Opening and closing a concentrated-liquidity position, as four tools.
 *
 * The range is an explicit input, never inferred. solOS refuses one that does not align to the
 * pool's tick spacing rather than rounding it, because rounding a range is choosing one and
 * choosing is the caller's job (ADR-0006).
 */
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import {
  ClosePositionInput,
  ExecuteClosePositionInput,
  ExecuteOpenPositionInput,
  OpenPositionInput,
} from "../domain/lifecycle-types.js";
import { hasLifecycle } from "../domain/types.js";
import {
  executeClosePosition,
  executeOpenPosition,
  simulateClosePosition,
  simulateOpenPosition,
} from "../use-cases/position-lifecycle.js";

/** @param {{ protocol: string }} input */
const gate = (input) => {
  if (!hasLifecycle(input.protocol)) {
    throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
  }
};

const OPEN_TEXT =
  "Open a new concentrated-liquidity position at a tick range you choose, on raydium (CLMM). " +
  "tickLower and tickUpper are explicit and must each be a multiple of the pool's tick " +
  "spacing; an unaligned range is refused rather than rounded, because rounding it would be " +
  "choosing a different range than the one asked for. amountA and amountB are maximum spends " +
  "in base units, never targets. The position is created with a fresh NFT generated for this " +
  "transaction, so its mint is not known before the open confirms: read the new position back " +
  "with a portfolio or position read afterwards. Rent for the position and its NFT is the " +
  "signer's and is only reclaimed by closing.";

const CLOSE_TEXT =
  "Close an emptied concentrated-liquidity position and reclaim its rent, on raydium (CLMM). " +
  "The venue refuses while any liquidity, unclaimed fee or unclaimed reward remains, so remove " +
  "all liquidity first — a full removal also sweeps fees and rewards. The position NFT is " +
  "burned and the position account is gone afterwards.";

export const simulateOpenPositionTool = defineTool({
  name: "solana_liquidity_simulate_open_position",
  group: "liquidity",
  tier: "simulate",
  title: "Simulate opening a liquidity position",
  description: `${OPEN_TEXT} Simulates without submitting anything; use solana_liquidity_execute_open_position to send.`,
  input: OpenPositionInput,
  check: gate,
  run: (input) => simulateOpenPosition(input),
});

export const executeOpenPositionTool = defineTool({
  name: "solana_liquidity_execute_open_position",
  group: "liquidity",
  tier: "execute",
  title: "Open a liquidity position",
  description: `${OPEN_TEXT} Submits and waits for confirmation; simulates the exact transaction first unless skipSimulation is true. Use solana_liquidity_simulate_open_position to preview.`,
  input: ExecuteOpenPositionInput,
  check: gate,
  run: (input) => executeOpenPosition(input),
});

export const simulateClosePositionTool = defineTool({
  name: "solana_liquidity_simulate_close_position",
  group: "liquidity",
  tier: "simulate",
  title: "Simulate closing a liquidity position",
  description: `${CLOSE_TEXT} Simulates without submitting anything; use solana_liquidity_execute_close_position to send.`,
  input: ClosePositionInput,
  check: gate,
  run: (input) => simulateClosePosition(input),
});

export const executeClosePositionTool = defineTool({
  name: "solana_liquidity_execute_close_position",
  group: "liquidity",
  tier: "execute",
  title: "Close a liquidity position",
  description: `${CLOSE_TEXT} Submits and waits for confirmation; simulates the exact transaction first unless skipSimulation is true. Use solana_liquidity_simulate_close_position to preview.`,
  input: ExecuteClosePositionInput,
  check: gate,
  run: (input) => executeClosePosition(input),
});
