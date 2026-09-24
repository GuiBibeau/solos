// @ts-check
import { expect, test } from "bun:test";
import {
  getDepositFundsDecoder,
  getEmberDepositDecoder,
  getWithdrawFundsDecoder,
  getEmberWithdrawDecoder,
  PHOENIX_PROGRAM_ADDRESS,
  EMBER_PROGRAM_ADDRESS,
  USDC_MINT_ADDRESS,
} from "@ellipsis-labs/rise";
import { collateralInstructions } from "./phoenix-collateral-instructions.js";
import { DEFAULT_AUTHORITY, OTHER_AUTHORITY } from "./phoenix-scenarios.js";

const fake = /** @type {import("@ellipsis-labs/rise").BuildWithdrawIxsResolvedInput} */ (
  /** @type {unknown} */ ({
    exchange: {
      phoenixProgramAddress: PHOENIX_PROGRAM_ADDRESS,
      logAuthorityAddress: OTHER_AUTHORITY,
      globalConfigurationAddress: OTHER_AUTHORITY,
      canonicalMint: OTHER_AUTHORITY,
      usdcMint: USDC_MINT_ADDRESS,
      globalVault: OTHER_AUTHORITY,
      globalTraderIndex: [OTHER_AUTHORITY],
      activeTraderBuffer: [OTHER_AUTHORITY],
      emberState: OTHER_AUTHORITY,
      emberVault: OTHER_AUTHORITY,
      perpAssetMap: OTHER_AUTHORITY,
      withdrawQueue: OTHER_AUTHORITY,
    },
    trader: {
      authority: DEFAULT_AUTHORITY,
      traderAccount: OTHER_AUTHORITY,
      usdcTokenAccount: OTHER_AUTHORITY,
      phoenixTokenAccount: OTHER_AUTHORITY,
    },
    amount: 1_000_000n,
  })
);

test("Phoenix collateral instruction builder encodes fixed exact input in official Ember and trader deposit", () => {
  const result = collateralInstructions("deposit", fake);
  expect(result).toHaveLength(3);
  expect(result[1]?.programAddress).toBe(EMBER_PROGRAM_ADDRESS);
  expect(result[2]?.programAddress).toBe(PHOENIX_PROGRAM_ADDRESS);
  expect(getEmberDepositDecoder().decode(result[1].data)).toBe(1_000_000n);
  expect(getDepositFundsDecoder().decode(result[2].data)).toBe(1_000_000n);
});

test("Phoenix collateral instruction builder withdraws fixed Phoenix-token input to wallet USDC ATA", () => {
  const result = collateralInstructions("withdraw", fake);
  expect(result).toHaveLength(5);
  expect(result[3]?.programAddress).toBe(PHOENIX_PROGRAM_ADDRESS);
  expect(result[4]?.programAddress).toBe(EMBER_PROGRAM_ADDRESS);
  expect(getWithdrawFundsDecoder().decode(result[3].data)).toBe(1_000_000n);
  expect(getEmberWithdrawDecoder().decode(result[4].data)).toBe(1_000_000n);
});
