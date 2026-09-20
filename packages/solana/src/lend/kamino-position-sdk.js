// @ts-check
/** @typedef {import("@kamino-finance/klend-sdk").KaminoMarket} KaminoMarketInstance */
/** @typedef {import("@kamino-finance/klend-sdk").KaminoReserve} KaminoReserveInstance */
/** @typedef {{ readonly slot: bigint; readonly blockTime: bigint }} LedgerInstant */
import { getBase58Decoder } from "@solana/kit";
import { validateMarketAccount } from "./kamino-account-validation.js";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";

const kaminoSdk = () => import("@kamino-finance/klend-sdk");

export class KaminoScanBoundError extends Error {}

export class KaminoObligationLayoutError extends Error {
  /** @param {string} account */
  constructor(account) {
    super("obligation account could not be decoded");
    this.account = account;
  }
}

export class KaminoPositionReserveError extends Error {
  /** @param {string} account */
  constructor(account) {
    super("position reserve could not be decoded");
    this.account = account;
  }
}

/** @param {any} rpc @param {string} marketAddress */
export const sdkLoadBareMarket = async (rpc, marketAddress) => {
  const sdk = await kaminoSdk();
  if (!(await validateMarketAccount(rpc, marketAddress, sdk))) return null;
  return sdk.KaminoMarket.load(
    rpc,
    /** @type {any} */ (marketAddress),
    sdk.DEFAULT_RECENT_SLOT_DURATION_MS,
    /** @type {any} */ (KLEND_PROGRAM_ID),
    false,
  );
};

/** @param {any} rpc @param {any} filters */
const programAccounts = async (rpc, filters) => {
  const response = await rpc
    .getProgramAccounts(KLEND_PROGRAM_ID, { filters, encoding: "base64" })
    .send();
  return /** @type {any[]} */ (response.value ?? response);
};

/** @param {any} rpc @param {string} market @param {string} owner */
export const sdkOwnerObligations = async (rpc, market, owner) => {
  const sdk = await kaminoSdk();
  const discriminator = getBase58Decoder().decode(sdk.Obligation.discriminator);
  const accounts = await programAccounts(rpc, [
    { memcmp: { offset: 0n, bytes: discriminator, encoding: "base58" } },
    { memcmp: { offset: 32n, bytes: market, encoding: "base58" } },
    { memcmp: { offset: 64n, bytes: owner, encoding: "base58" } },
  ]);
  if (accounts.length > 4096) throw new KaminoScanBoundError("obligation account bound");
  return accounts.map((entry) => decodeObligation(sdk, entry, { market, owner }));
};

/** @param {Awaited<ReturnType<typeof kaminoSdk>>} sdk @param {any} entry @param {{ market: string; owner: string }} target */
const decodeObligation = (sdk, entry, target) => {
  const account = entry.pubkey.toString();
  try {
    if (entry.account.owner !== KLEND_PROGRAM_ID) throw new Error("foreign owner");
    const state = sdk.Obligation.decode(Buffer.from(entry.account.data[0], "base64"));
    if (
      state.lendingMarket.toString() !== target.market ||
      state.owner.toString() !== target.owner
    ) {
      throw new Error("inconsistent identity");
    }
    return {
      address: account,
      market: target.market,
      owner: target.owner,
      deposits: state.deposits.map((deposit) => ({
        reserve: deposit.depositReserve.toString(),
        collateral: deposit.depositedAmount.toString(),
      })),
    };
  } catch {
    throw new KaminoObligationLayoutError(account);
  }
};

/** @param {any} rpc @param {KaminoMarketInstance} market */
export const sdkPositionReserves = async (rpc, market) => {
  const sdk = await kaminoSdk();
  const discriminator = getBase58Decoder().decode(sdk.Reserve.discriminator);
  const accounts = await programAccounts(rpc, [
    { memcmp: { offset: 0n, bytes: discriminator, encoding: "base58" } },
    { memcmp: { offset: 32n, bytes: market.getAddress(), encoding: "base58" } },
  ]);
  if (accounts.length > 4096) throw new KaminoScanBoundError("reserve account bound");
  return accounts
    .map((entry) => decodeReserve(sdk, entry, { rpc, market }))
    .filter((reserve) => reserve.getKind().isFloatRate());
};

/** @param {Awaited<ReturnType<typeof kaminoSdk>>} sdk @param {any} entry @param {{ rpc: any; market: KaminoMarketInstance }} context */
const decodeReserve = (sdk, entry, context) => {
  const account = entry.pubkey.toString();
  try {
    if (entry.account.owner !== KLEND_PROGRAM_ID) throw new Error("foreign owner");
    const state = sdk.Reserve.decode(Buffer.from(entry.account.data[0], "base64"));
    return new sdk.KaminoReserve(
      state,
      entry.pubkey,
      /** @type {any} */ (undefined),
      context.rpc,
      sdk.DEFAULT_RECENT_SLOT_DURATION_MS,
      context.market.state.reserveRewardsMaxAprBps,
      undefined,
      /** @type {any} */ (KLEND_PROGRAM_ID),
    );
  } catch {
    throw new KaminoPositionReserveError(account);
  }
};

/** @param {KaminoReserveInstance} reserve @param {LedgerInstant} instant */
export const sdkPositionReserve = (reserve, instant) => ({
  address: reserve.address.toString(),
  mint: reserve.getLiquidityMint().toString(),
  receiptMint: reserve.getCTokenMint().toString(),
  decimals: reserve.getMintDecimals(),
  collateralPerLiquidity: reserve
    .getEstimatedCollateralExchangeRate(/** @type {any} */ (instant), 0)
    .toString(),
});
