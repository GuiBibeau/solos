// @ts-check
/** Pinned kLend collateral-farm setup shared by deposits and withdrawals. */
import { Effect } from "effect";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";

// Farms program and UserState size from the klend-sdk's pinned farms-sdk 3.2.26.
export const FARMS_PROGRAM_ID = "FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr";
export const FARM_USER_STATE_SIZE = 920;
const RENT = "SysvarRent111111111111111111111111111111111";
const SYSTEM = "11111111111111111111111111111111";

/** @param {any} sdk @param {string | null | undefined} farm @param {string} obligation */
export const farmUserAddress = async (sdk, farm, obligation) =>
  farm ? sdk.obligationFarmStatePda(farm, obligation, FARMS_PROGRAM_ID) : null;

/**
 * Validate farm identities before signing. Never silently refresh an unowned or missing farm.
 * @param {{ readonly owner: string } | null | undefined} farmRow
 * @param {{ readonly owner: string } | null | undefined} userRow
 * @param {boolean} hasFarm
 * @returns {{ status: "reject"; reason: string } | { status: "ok"; initializeFarm: boolean }}
 */
export const checkFarmRows = (farmRow, userRow, hasFarm) => {
  if (!hasFarm) return { status: "ok", initializeFarm: false };
  if (!farmRow || farmRow.owner !== FARMS_PROGRAM_ID)
    return {
      status: "reject",
      reason: "the reserve's collateral farm is missing or not owned by the pinned farms program",
    };
  if (userRow && userRow.owner !== FARMS_PROGRAM_ID)
    return {
      status: "reject",
      reason: "the obligation's farm account is not owned by the pinned farms program",
    };
  return { status: "ok", initializeFarm: !userRow };
};

/**
 * Read farm and farm-user-state through the same checked RPC seam as the rest of the plan.
 * @param {{ reader: import("./kamino-deposit-plan.js").DepositReader; sdk: any; farm: string | null | undefined; obligation: string }} input
 */
export const readCollateralFarm = ({ reader, sdk, farm, obligation }) =>
  Effect.gen(function* () {
    const farmUser = yield* Effect.promise(() => farmUserAddress(sdk, farm, obligation));
    if (!farm || !farmUser)
      return { status: /** @type {const} */ ("ok"), farmUser: null, initializeFarm: false };
    const [farmRow, userRow] = yield* reader.rows([farm, farmUser]);
    const checked = checkFarmRows(farmRow, userRow, true);
    return checked.status === "reject" ? checked : { ...checked, farmUser };
  });

/** @param {import("./kamino-deposit-plan.js").DepositReader} reader @param {boolean} initializeFarm */
export const farmRent = (reader, initializeFarm) =>
  initializeFarm
    ? Effect.map(reader.rent([FARM_USER_STATE_SIZE]), ([rent]) => {
        if (rent === undefined) throw new Error("farm rent quote was missing");
        return rent;
      })
    : Effect.succeed(0n);

/** @param {any} sdk @param {any} parts @param {any} base */
const initFarm = (sdk, parts, base) =>
  parts.initializeFarm
    ? [
        sdk.initObligationFarmsForReserve(
          { mode: 0 },
          {
            owner: parts.intent.owner,
            payer: parts.signer,
            ...base,
            obligationFarm: parts.farmUser,
            farmsProgram: FARMS_PROGRAM_ID,
            rent: RENT,
            systemProgram: SYSTEM,
          },
          [],
          KLEND_PROGRAM_ID,
        ),
      ]
    : [];

/**
 * SDK-built farm init (only when absent) and refresh before/after the combined instruction.
 * The trailing refresh synchronizes the changed stake, as in the pinned SDK action builder.
 * @param {any} sdk
 * @param {{ intent: { market: string; owner: string }; signer: import("../signer/kit-signer.js").KitCompatibleSigner; obligation: string; reserve: { reserve: string; lendingMarketAuthority: string; farmCollateral?: string | null }; farmUser: string | null; initializeFarm: boolean }} parts
 */
export const collateralFarmInstructions = (sdk, parts) => {
  const farm = parts.reserve.farmCollateral;
  if (!farm || !parts.farmUser) return { init: [], refresh: [] };
  const base = {
    obligation: parts.obligation,
    lendingMarketAuthority: parts.reserve.lendingMarketAuthority,
    reserve: parts.reserve.reserve,
    reserveFarmState: farm,
    lendingMarket: parts.intent.market,
  };
  const init = initFarm(sdk, parts, base);
  const refresh = [
    sdk.refreshObligationFarmsForReserve(
      { mode: 0 },
      {
        crank: parts.signer,
        baseAccounts: { ...base, obligationFarmUserState: parts.farmUser },
        farmsProgram: FARMS_PROGRAM_ID,
        rent: RENT,
        systemProgram: SYSTEM,
      },
      [],
      KLEND_PROGRAM_ID,
    ),
  ];
  return { init, refresh };
};
