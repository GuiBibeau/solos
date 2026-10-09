// @ts-check
import {
  DepositPerpCollateralActionSchema,
  WithdrawPerpCollateralActionSchema,
} from "@solos-sh/actions";
import { z } from "zod";
import { defineTool } from "../../shared/tools/define-tool.js";
import {
  executePerpDeposit,
  executePerpWithdrawal,
  simulatePerpDeposit,
  simulatePerpWithdrawal,
} from "../use-cases/collateral.js";

const DepositInput = z
  .object({
    amount: DepositPerpCollateralActionSchema.shape.amount.describe(
      "Exact USDC base units to debit from the configured wallet; output is estimated, not guaranteed",
    ),
  })
  .strict();
const WithdrawInput = z
  .object({
    amount: WithdrawPerpCollateralActionSchema.shape.amount.describe(
      "Exact Phoenix collateral-token base units to debit; wallet USDC receipt is estimated, not guaranteed",
    ),
  })
  .strict();

export const simulatePerpDepositTool = defineTool({
  name: "solana_perp_simulate_deposit_collateral",
  group: "perp",
  tier: "simulate",
  stability: "stable",
  action: "deposit_perp_collateral",
  title: "Simulate funding Phoenix collateral",
  description:
    "Preview an explicit fixed-input USDC deposit for the current Phoenix trader. The credited amount is only an estimate.",
  input: DepositInput,
  run: (input) => simulatePerpDeposit(input),
});

export const executePerpDepositTool = defineTool({
  name: "solana_perp_execute_deposit_collateral",
  group: "perp",
  tier: "execute",
  stability: "stable",
  action: "deposit_perp_collateral",
  title: "Deposit USDC into Phoenix collateral",
  description:
    "Deposit exact USDC input from the current wallet, then report actual balance changes. Output is not guaranteed; never opens an order.",
  input: DepositInput,
  run: (input) => executePerpDeposit(input),
});

export const simulatePerpWithdrawalTool = defineTool({
  name: "solana_perp_simulate_withdraw_collateral",
  group: "perp",
  tier: "simulate",
  stability: "stable",
  action: "withdraw_perp_collateral",
  title: "Simulate Phoenix collateral removal",
  description:
    "Preview an explicit fixed Phoenix-token input withdrawal to the current wallet's USDC account, after all-market risk checks.",
  input: WithdrawInput,
  run: (input) => simulatePerpWithdrawal(input),
});

export const executePerpWithdrawalTool = defineTool({
  name: "solana_perp_execute_withdraw_collateral",
  group: "perp",
  tier: "execute",
  stability: "stable",
  action: "withdraw_perp_collateral",
  title: "Withdraw Phoenix collateral to your wallet",
  description:
    "Remove an exact Phoenix-token input only when all markets are flat and settled, then report actual wallet USDC receipt (not guaranteed).",
  input: WithdrawInput,
  run: (input) => executePerpWithdrawal(input),
});
