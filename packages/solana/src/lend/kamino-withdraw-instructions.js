// @ts-check
import { none } from "@solana/kit";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";
import { u64ForSdkLayout } from "./kamino-deposit-instructions.js";

const INSTRUCTIONS_SYSVAR = "Sysvar1nstructions1111111111111111111111111";

/**
 * Pinned klend-SDK combined withdrawal. The wire argument is receipt-token collateral,
 * NOT the caller's underlying amount. Refresh all occupied deposit reserves so the
 * obligation health check runs under current values. Never use u64::MAX withdraw-all.
 * @param {any} sdk
 * @param {{ intent: import("./kamino-deposit-plan.js").DepositIntent; facts: import("./kamino-deposit-plan.js").ReserveFacts; signer: import("../signer/kit-signer.js").KitCompatibleSigner; obligation: string; destination: string; collateral: bigint; collateralProgram: string; reserves: string[] }} parts
 */
export const withdrawInstructions = (sdk, parts) => {
  const { intent, facts, signer, obligation, destination, collateral } = parts;
  return [
    sdk.refreshReserve({
      reserve: facts.reserve,
      lendingMarket: intent.market,
      pythOracle: none(),
      switchboardPriceOracle: none(),
      switchboardTwapOracle: none(),
      scopePrices: none(),
    }),
    sdk.refreshObligation(
      { lendingMarket: intent.market, obligation },
      [...new Set([facts.reserve, ...parts.reserves])].map((address) => ({
        address,
        role: /** @type {const} */ (1),
      })),
      /** @type {any} */ (KLEND_PROGRAM_ID),
    ),
    sdk.withdrawObligationCollateralAndRedeemReserveCollateral(
      { collateralAmount: u64ForSdkLayout(collateral) },
      {
        owner: signer,
        obligation,
        lendingMarket: intent.market,
        lendingMarketAuthority: facts.lendingMarketAuthority,
        withdrawReserve: facts.reserve,
        reserveLiquidityMint: facts.liquidityMint,
        reserveSourceCollateral: facts.collateralSupplyVault,
        reserveCollateralMint: facts.collateralMint,
        reserveLiquiditySupply: facts.liquiditySupplyVault,
        userDestinationLiquidity: destination,
        placeholderUserDestinationCollateral: none(),
        collateralTokenProgram: parts.collateralProgram,
        liquidityTokenProgram: facts.liquidityTokenProgram,
        instructionSysvarAccount: INSTRUCTIONS_SYSVAR,
      },
    ),
  ];
};
