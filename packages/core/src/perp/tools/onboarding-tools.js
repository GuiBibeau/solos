// @ts-check
import { z } from "zod";
import { defineTool } from "../../shared/tools/define-tool.js";
import {
  executeOnboardTrader,
  getOnboardingStatus,
  simulateOnboardTrader,
} from "../use-cases/onboard-trader.js";

const Empty = z.object({}).strict();

export const getOnboardingStatusTool = defineTool({
  name: "solana_perp_get_onboarding_status",
  group: "perp",
  tier: "read",
  stability: "beta",
  title: "Check Phoenix trader enrollment",
  description:
    "Check whether the current wallet's Phoenix trader can place orders and deposit collateral.",
  input: Empty,
  run: () => getOnboardingStatus(),
});

export const simulateOnboardTraderTool = defineTool({
  name: "solana_perp_simulate_onboard_trader",
  group: "perp",
  tier: "simulate",
  stability: "beta",
  action: "onboard_perp",
  title: "Simulate Phoenix trader enrollment",
  description:
    "Preview registration and trading activation of the current wallet's default Phoenix trader without submitting.",
  input: Empty,
  run: () => simulateOnboardTrader(),
});

export const executeOnboardTraderTool = defineTool({
  name: "solana_perp_execute_onboard_trader",
  group: "perp",
  tier: "execute",
  stability: "beta",
  action: "onboard_perp",
  title: "Enroll current wallet with Phoenix",
  description:
    "Explicitly register and activate the current wallet's Phoenix trader after simulation. Does not fund the trader or open a position.",
  input: Empty,
  run: () => executeOnboardTrader(),
});
