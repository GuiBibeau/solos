// @ts-check
import { PHOENIX_PROGRAM_ADDRESS, USDC_MINT_ADDRESS } from "@ellipsis-labs/rise";
import { jsonRpc, seedAddress, surfnetCheatcodes } from "../surfnet/index.js";
import { seedPhoenixCollateralFixture } from "./phoenix-collateral-fixture.js";
import { collateralAtas } from "./phoenix-collateral-tokens.js";
import { startPhoenixFixture } from "./phoenix-fixture.js";
import { coldState, positionRow, subaccount } from "./phoenix-scenarios.js";

/** @param {boolean} exposure @param {bigint} positionLots @param {boolean} otherFunding */
const positionRows = (exposure, positionLots, otherFunding) => {
  const rows = [];
  if (positionLots !== 0n) rows.push(positionRow("SOL", positionLots.toString()));
  else if (exposure) rows.push(positionRow("SOL", "100"));
  if (otherFunding) rows.push({ ...positionRow("ETH", "0"), unsettledFundingQuoteLots: "1" });
  return rows;
};

/** @param {string} authority @param {{collateral:bigint; slot:number; exposure:boolean; positionLots:bigint; tradingRestricted:boolean; depositDisabled:boolean; withdrawDisabled:boolean; spotExposure:boolean;otherFunding:boolean}} snapshot */
const traderState = (
  authority,
  {
    collateral,
    slot,
    exposure,
    positionLots,
    tradingRestricted,
    depositDisabled,
    withdrawDisabled,
    spotExposure,
    otherFunding,
  },
) => {
  const state = coldState(authority);
  state.snapshot.capabilities.capabilities = {
    placeMarketOrder: { immediate: !tradingRestricted },
    riskIncreasingTrade: { immediate: !tradingRestricted },
    depositCollateral: { immediate: !depositDisabled },
    withdrawCollateral: { immediate: !withdrawDisabled },
  };
  state.snapshot.subaccounts = [
    subaccount(0, {
      collateral: collateral.toString(),
      positions: positionRows(exposure, positionLots, otherFunding),
      spotCollaterals: spotExposure ? [{ balance: "1" }] : [],
    }),
  ];
  state.slot = slot;
  return state;
};

/** @param {ReturnType<typeof import("@ellipsis-labs/rise").decodeGlobalConfiguration>} global */
const exchange = (global) => ({
  programId: PHOENIX_PROGRAM_ADDRESS,
  globalConfig: global.accountKey,
  usdcMint: USDC_MINT_ADDRESS,
  canonicalMint: global.canonicalTokenMintKey,
  globalVault: global.globalVaultKey,
  perpAssetMap: global.perpAssetMapKey,
  withdrawQueue: global.withdrawQueueKey,
  globalTraderIndex: [global.globalTraderIndexHeaderKey],
  activeTraderBuffer: [global.activeTraderBufferHeaderKey],
  withdrawalsAvailable: true,
});

/** @param {string} rpcUrl @param {Uint8Array} seed @param {{ collateral?: bigint; walletUsdc?: number; exposure?: boolean; positionLots?:bigint; staleRisk?: boolean; tradingRestricted?: boolean; depositDisabled?: boolean; withdrawDisabled?: boolean; spotExposure?: boolean; otherFunding?: boolean; market?:Record<string,unknown> }} [options] */
export const startCollateralScenario = async (rpcUrl, seed, options = {}) => {
  const owner = await seedAddress(seed);
  const collateral = options.collateral ?? 0n;
  const { trader, global } = await seedPhoenixCollateralFixture(rpcUrl, owner, collateral);
  const cheats = surfnetCheatcodes(rpcUrl);
  await cheats.fundSol(owner, 1);
  await cheats.ensureMint(USDC_MINT_ADDRESS, 6);
  await cheats.ensureMint(global.canonicalTokenMintKey, 6);
  await cheats.setTokenAccount(owner, USDC_MINT_ADDRESS, options.walletUsdc ?? 2_000_000);
  const atas = await collateralAtas(owner, USDC_MINT_ADDRESS, global.canonicalTokenMintKey);
  const slot = await jsonRpc(rpcUrl, "getSlot", [{ commitment: "confirmed" }]);
  const fixture = startPhoenixFixture({
    trader: (/** @type {string} */ authority) =>
      traderState(authority, {
        collateral,
        slot: options.staleRisk ? slot - 13 : slot,
        exposure: options.exposure ?? false,
        positionLots: options.positionLots ?? 0n,
        tradingRestricted: options.tradingRestricted ?? false,
        depositDisabled: options.depositDisabled ?? false,
        withdrawDisabled: options.withdrawDisabled ?? false,
        spotExposure: options.spotExposure ?? false,
        otherFunding: Boolean(options.otherFunding),
      }),
    exchangeSnapshot: { slot: String(slot), exchange: exchange(global) },
    market: options.market,
  });
  return {
    owner,
    trader,
    global,
    atas,
    fixture,
    collateral,
    walletUsdc: BigInt(options.walletUsdc ?? 2_000_000),
  };
};
