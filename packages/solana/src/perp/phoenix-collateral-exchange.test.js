// @ts-check
import { expect, test } from "bun:test";
import {
  PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
  PHOENIX_PROGRAM_ADDRESS,
  USDC_MINT_ADDRESS,
} from "@ellipsis-labs/rise";
import { validatedExchange } from "./phoenix-collateral-exchange.js";
import { OTHER_AUTHORITY } from "./phoenix-scenarios.js";

const snapshot = {
  slot: "100",
  exchange: {
    programId: PHOENIX_PROGRAM_ADDRESS,
    usdcMint: USDC_MINT_ADDRESS,
    canonicalMint: OTHER_AUTHORITY,
    globalConfig: PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
    globalVault: OTHER_AUTHORITY,
    perpAssetMap: OTHER_AUTHORITY,
    withdrawQueue: OTHER_AUTHORITY,
    globalTraderIndex: [OTHER_AUTHORITY],
    activeTraderBuffer: [OTHER_AUTHORITY],
    withdrawalsAvailable: true,
  },
};

test("Phoenix collateral exchange accepts fresh canonical program and USDC identities", () => {
  expect(validatedExchange(snapshot, 101n).usdcMint).toBe(USDC_MINT_ADDRESS);
});

test("Phoenix collateral exchange rejects redirected USDC mint before signing", () => {
  expect(() =>
    validatedExchange(
      { ...snapshot, exchange: { ...snapshot.exchange, usdcMint: OTHER_AUTHORITY } },
      101n,
    ),
  ).toThrow();
});
