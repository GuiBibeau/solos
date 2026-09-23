// @ts-check
import { none } from "@solana/kit";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";
import { u64ForSdkLayout } from "./kamino-deposit-instructions.js";
import { collateralFarmInstructions } from "./kamino-farm-instructions.js";
import { refreshReserveInstruction } from "./kamino-refresh-reserve.js";

const INSTRUCTIONS_SYSVAR = "Sysvar1nstructions1111111111111111111111111";

/** @param {any} parts */
const withdrawAccounts = (parts) => ({
  owner: parts.signer,
  obligation: parts.obligation,
  lendingMarket: parts.intent.market,
  lendingMarketAuthority: parts.facts.lendingMarketAuthority,
  withdrawReserve: parts.facts.reserve,
  reserveLiquidityMint: parts.facts.liquidityMint,
  reserveSourceCollateral: parts.facts.collateralSupplyVault,
  reserveCollateralMint: parts.facts.collateralMint,
  reserveLiquiditySupply: parts.facts.liquiditySupplyVault,
  userDestinationLiquidity: parts.destination,
  placeholderUserDestinationCollateral: none(),
  collateralTokenProgram: parts.collateralProgram,
  liquidityTokenProgram: parts.facts.liquidityTokenProgram,
  instructionSysvarAccount: INSTRUCTIONS_SYSVAR,
});

/**
 * Pinned klend-SDK combined withdrawal. The wire argument is receipt-token collateral,
 * NOT the caller's underlying amount. Refresh all occupied deposit reserves so the
 * obligation health check runs under current values. Never use u64::MAX withdraw-all.
 * @param {any} sdk
 * @param {{ intent: import("./kamino-deposit-plan.js").DepositIntent; facts: import("./kamino-deposit-plan.js").ReserveFacts; signer: import("../signer/kit-signer.js").KitCompatibleSigner; obligation: string; destination: string; collateral: bigint; collateralProgram: string; reserves: string[]; farmUser: string | null; initializeFarm: boolean }} parts
 */
export const withdrawInstructions = (sdk, parts) => {
  const { intent, facts, obligation, collateral } = parts;
  const farm = collateralFarmInstructions(sdk, { ...parts, reserve: facts });
  return [
    ...farm.init,
    refreshReserveInstruction(sdk, {
      market: intent.market,
      reserve: facts.reserve,
      oracles: facts.oracles,
    }),
    sdk.refreshObligation(
      { lendingMarket: intent.market, obligation },
      [...new Set([facts.reserve, ...parts.reserves])].map((address) => ({
        address,
        role: /** @type {const} */ (1),
      })),
      /** @type {any} */ (KLEND_PROGRAM_ID),
    ),
    ...farm.refresh,
    sdk.withdrawObligationCollateralAndRedeemReserveCollateral(
      { collateralAmount: u64ForSdkLayout(collateral) },
      withdrawAccounts(parts),
    ),
    ...farm.refresh,
  ];
};
