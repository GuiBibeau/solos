// @ts-check
import { address, getAddressEncoder } from "@solana/kit";
import { jsonRpc } from "../surfnet/index.js";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";

const MARKET_SIZE = 4664;
const RESERVE_SIZE = 8624;
const OBLIGATION_SIZE = 3344;
const MARKET_DISCRIMINATOR = [246, 114, 50, 98, 72, 157, 28, 120];
const RESERVE_DISCRIMINATOR = [43, 242, 204, 202, 26, 247, 59, 127];
const OBLIGATION_DISCRIMINATOR = [168, 206, 141, 106, 88, 76, 172, 167];
const addressEncoder = getAddressEncoder();

/** @param {Uint8Array} bytes @param {number} offset @param {string} value */
const putAddress = (bytes, offset, value) =>
  bytes.set(addressEncoder.encode(address(value)), offset);

/** @param {Uint8Array} bytes @param {number} offset @param {bigint} value */
const putU64 = (bytes, offset, value) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigUint64(offset, value, true);

/** @param {Uint8Array} bytes @param {number} offset @param {number} value */
const putU16 = (bytes, offset, value) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true);

/** @param {Uint8Array} bytes */
const accountData = (bytes) => Buffer.from(bytes).toString("hex");

/** @param {{ referralFeeBps?: number }} [options] */
export const positionMarketBytes = (options) => {
  const bytes = new Uint8Array(MARKET_SIZE);
  bytes.set(MARKET_DISCRIMINATOR);
  putU16(bytes, 120, options?.referralFeeBps ?? 0);
  return bytes;
};

/** @param {{ market: string; mint: string; receiptMint: string; available: bigint; collateralSupply: bigint; decimals: number }} input */
export const positionReserveBytes = (input) => {
  const bytes = new Uint8Array(RESERVE_SIZE);
  bytes.set(RESERVE_DISCRIMINATOR);
  putAddress(bytes, 32, input.market);
  putAddress(bytes, 128, input.mint);
  putU64(bytes, 224, input.available);
  putU64(bytes, 272, BigInt(input.decimals));
  putAddress(bytes, 2560, input.receiptMint);
  putU64(bytes, 2592, input.collateralSupply);
  return bytes;
};

/** @param {{ market: string; owner: string; deposits: ReadonlyArray<{ reserve: string; amount: bigint }>; borrowReserve?: string }} input */
export const positionObligationBytes = (input) => {
  const bytes = new Uint8Array(OBLIGATION_SIZE);
  bytes.set(OBLIGATION_DISCRIMINATOR);
  putAddress(bytes, 32, input.market);
  putAddress(bytes, 64, input.owner);
  for (const [index, deposit] of input.deposits.entries()) {
    putAddress(bytes, 96 + index * 136, deposit.reserve);
    putU64(bytes, 128 + index * 136, deposit.amount);
  }
  if (input.borrowReserve) {
    putAddress(bytes, 1208, input.borrowReserve);
    bytes[2287] = 1;
  }
  return bytes;
};

/** @param {string} rpcUrl @param {string} account @param {Uint8Array} bytes */
export const seedKaminoAccount = (rpcUrl, account, bytes) =>
  jsonRpc(rpcUrl, "surfnet_setAccount", [
    account,
    {
      lamports: 10_000_000,
      data: accountData(bytes),
      owner: KLEND_PROGRAM_ID,
      executable: false,
    },
  ]);
