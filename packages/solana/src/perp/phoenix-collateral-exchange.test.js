// @ts-check
import { expect, test } from "bun:test";
import {
  PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
  PHOENIX_PROGRAM_ADDRESS,
  USDC_MINT_ADDRESS,
} from "@ellipsis-labs/rise";
import { BuildRejected } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaRpc, SolanaRpcLive } from "../index.js";
import { ensureOfflineSurfnet } from "../surfnet/index.js";
import { readCollateralExchange } from "./phoenix-collateral-exchange-live.js";
import { validatedExchange } from "./phoenix-collateral-exchange.js";
import { startPhoenixFixture } from "./phoenix-fixture.js";
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

test("Phoenix exchange [integration] preserves a safe future-slot rejection through the live adapter", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const fixture = startPhoenixFixture({ exchangeSnapshot: { ...snapshot, slot: "10000000000" } });
  try {
    const read = Effect.flatMap(SolanaRpc, (ctx) =>
      readCollateralExchange({ baseUrl: fixture.url }, ctx),
    );
    const exit = await Effect.runPromiseExit(
      read.pipe(Effect.provide(SolanaRpcLive(surfnet.rpcUrl, surfnet.wsUrl))),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = Cause.failureOption(exit.cause);
      expect(Option.isSome(error) && error.value).toBeInstanceOf(BuildRejected);
      if (Option.isSome(error))
        expect(/** @type {BuildRejected} */ (error.value).reason).toBe(
          "Phoenix exchange snapshot is ahead of the configured RPC",
        );
    }
  } finally {
    fixture.stop();
  }
});

test("Phoenix collateral exchange accepts old metadata only for subsequent on-chain identity checks", () => {
  expect(validatedExchange(snapshot, 113n).globalConfig).toBe(PHOENIX_GLOBAL_CONFIGURATION_ADDRESS);
});

test("Phoenix collateral exchange rejects redirected USDC mint before signing", () => {
  expect(() =>
    validatedExchange(
      { ...snapshot, exchange: { ...snapshot.exchange, usdcMint: OTHER_AUTHORITY } },
      101n,
    ),
  ).toThrow();
});
