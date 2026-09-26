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
  "Open a new concentrated-liquidity position at a range you choose. " +
  "raydium (CLMM): tickLower and tickUpper must each be a multiple of the pool's tick spacing; " +
  "an unaligned range is refused rather than rounded. amountA and amountB are maximum spends " +
  "in base units, never targets. The position NFT is generated for this transaction. " +
  "meteora (DLMM): pass lowerBinId and width. Width must be an integer from 1 to 70; an illegal " +
  "width is refused, never clamped. The open is empty (initialize_position); add liquidity " +
  "afterwards with the deposit tools. The position account is a fresh keypair and its pubkey is " +
  "returned on the execute result. Rent is the signer's and is reclaimed by closing.";

const CLOSE_TEXT =
  "Close an emptied concentrated-liquidity position and reclaim its rent. " +
  "raydium (CLMM) refuses while any liquidity, unclaimed fee, or unclaimed reward remains, and " +
  "burns the position NFT. meteora (DLMM) refuses while any liquidity share remains, so remove " +
  "them with the withdraw tool first. A meteora position is the PositionV2 account, not an NFT.";

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
