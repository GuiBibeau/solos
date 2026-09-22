// @ts-check
/**
 * The pinned SDK instruction sequence for one Kamino deposit, in protocol order: refresh
 * the reserve, initialize the user metadata and the plain obligation when absent, refresh
 * the obligation across every reserve it touches, then the combined deposit that transfers
 * the exact underlying amount and mints the collateral straight into the reserve's supply
 * vault. Only builders from the pinned klend-sdk are used; the one value the SDK's borsh
 * layouts take in a foreign shape is the u64 amount, handed over in its exact wire form.
 */
import { none } from "@solana/kit";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";

const RENT_SYSVAR = "SysvarRent111111111111111111111111111111111";
const INSTRUCTIONS_SYSVAR = "Sysvar1nstructions1111111111111111111111111";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/**
 * The exact value shape the SDK's borsh u64 instruction layouts encode: little-endian, 8
 * bytes. The layout, discriminator and account order stay 100% pinned SDK code; only the
 * u64 field is handed over in the wire form it writes (bigint amounts are the domain norm).
 * @param {bigint} value
 */
const u64ForSdkLayout = (value) => ({
  /** @param {any} _bufferCtor @param {any} _encoding @param {number} length */
  toArrayLike: (_bufferCtor, _encoding, length) => {
    if (value < 0n || value >= 1n << 64n) throw new RangeError("u64 out of range");
    const bytes = new ArrayBuffer(length);
    new DataView(bytes).setBigUint64(0, value, true);
    return Buffer.from(bytes);
  },
});

/**
 * The pinned account-init pair: the owner's user-metadata PDA and the vanilla supply
 * obligation, each only when absent, both under the signer's sole authority.
 * @param {any} sdk the pinned klend-sdk module
 * @param {{
 *   readonly intent: { readonly market: string };
 *   readonly signer: import("../signer/kit-signer.js").KitCompatibleSigner;
 *   readonly obligation: string;
 *   readonly metadata: string;
 *   readonly initializeMetadata: boolean;
 *   readonly initializeObligation: boolean;
 * }} parts
 * @returns {readonly { programAddress: string }[]}
 */
const initInstructions = (sdk, parts) => [
  ...(parts.initializeMetadata
    ? [
        sdk.initUserMetadata(
          { userLookupTable: SYSTEM_PROGRAM },
          {
            owner: parts.signer,
            feePayer: parts.signer,
            userMetadata: parts.metadata,
            referrerUserMetadata: none(),
            rent: RENT_SYSVAR,
            systemProgram: SYSTEM_PROGRAM,
          },
        ),
      ]
    : []),
  ...(parts.initializeObligation
    ? [
        sdk.initObligation(
          { args: { tag: u64ForSdkLayout(0n), id: u64ForSdkLayout(0n) } },
          {
            obligationOwner: parts.signer,
            feePayer: parts.signer,
            obligation: parts.obligation,
            lendingMarket: parts.intent.market,
            seed1Account: SYSTEM_PROGRAM,
            seed2Account: SYSTEM_PROGRAM,
            ownerUserMetadata: parts.metadata,
            rent: RENT_SYSVAR,
            systemProgram: SYSTEM_PROGRAM,
          },
        ),
      ]
    : []),
];

/**
 * The combined deposit's account metas, in the pinned codegen order: the exact u64 amount
 * moves from the signer's source account and mints collateral straight into the reserve's
 * supply vault (ADR-0019), with placeholder destination none() as the SDK requires.
 * @param {any} parts
 * @param {import("./kamino-deposit-plan.js").ReserveFacts} reserve
 * @param {string} sourceAta
 */
const depositAccounts = (parts, reserve, sourceAta) => ({
  owner: parts.signer,
  obligation: parts.obligation,
  lendingMarket: parts.intent.market,
  lendingMarketAuthority: reserve.lendingMarketAuthority,
  reserve: reserve.reserve,
  reserveLiquidityMint: reserve.liquidityMint,
  reserveLiquiditySupply: reserve.liquiditySupplyVault,
  reserveCollateralMint: reserve.collateralMint,
  reserveDestinationDepositCollateral: reserve.collateralSupplyVault,
  userSourceLiquidity: sourceAta,
  placeholderUserDestinationCollateral: none(),
  collateralTokenProgram: parts.collateralTokenProgram,
  liquidityTokenProgram: reserve.liquidityTokenProgram,
  instructionSysvarAccount: INSTRUCTIONS_SYSVAR,
});

/**
 * The pinned SDK instruction sequence for one deposit, in protocol order. `sdk` is the
 * pinned klend-sdk module (its kit-2 branded types are seam-cast; the rpc-seam file
 * documents why plain base58 strings satisfy the builders at runtime); `parts` carries
 * the plan's intent, the executor's signer instance, reserve facts, derived addresses,
 * the collateral mint's token program, and which accounts to initialize.
 * @param {any} sdk
 * @param {any} parts
 * @returns {readonly { programAddress: string }[]} kit instruction values
 */
export const depositInstructions = (sdk, parts) => {
  const { intent, reserve, obligation, sourceAta } = parts;
  const refreshRemaining = [...new Set([reserve.reserve, ...parts.existingDeposits])].map(
    (depositReserve) => ({ address: depositReserve, role: /** @type {const} */ (1) }),
  );
  return [
    sdk.refreshReserve({
      reserve: reserve.reserve,
      lendingMarket: intent.market,
      pythOracle: none(),
      switchboardPriceOracle: none(),
      switchboardTwapOracle: none(),
      scopePrices: none(),
    }),
    ...initInstructions(sdk, parts),
    sdk.refreshObligation(
      { lendingMarket: intent.market, obligation },
      refreshRemaining,
      /** @type {any} */ (KLEND_PROGRAM_ID),
    ),
    sdk.depositReserveLiquidityAndObligationCollateral(
      { liquidityAmount: u64ForSdkLayout(intent.amount) },
      depositAccounts(parts, reserve, sourceAta),
    ),
  ];
};
