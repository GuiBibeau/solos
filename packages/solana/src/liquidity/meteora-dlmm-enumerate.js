// @ts-check
/**
 * Enumerate one owner's Meteora DLMM positions.
 *
 * PositionV2 is not an NFT. The official scan at pin 576919e3
 * (`getAllLbPairPositionsByUser`) is getProgramAccounts with positionV2Filter()
 * (discriminator memcmp at offset 0) and positionOwnerFilter(owner) (memcmp at offset
 * 8 + 32 = 40). Identity is the position account pubkey. There is no receipt mint, so
 * receiptMints stays empty: a fabricated mint would look like a wallet claim.
 *
 * Complete or failed. More than MAX_POSITION_CANDIDATES accounts is
 * LiquidityEnumerationIncomplete. One undecodable account fails the whole enumeration
 * with LiquidityPositionUnavailable, the same typed error Orca and Raydium raise for a
 * present account that does not decode.
 */
import { address, getBase58Decoder } from "@solana/kit";
import { LiquidityEnumerationIncomplete, LiquidityPositionUnavailable } from "@solos/core";
import { Effect } from "effect";
import { base64AccountData } from "../market/mint-account.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { MAX_POSITION_CANDIDATES } from "./liquidity-enumerate-select.js";
import { decodePositionV2 } from "./meteora-dlmm-decode.js";
import {
  METEORA_DLMM_PROGRAM,
  POSITION_V2_DISCRIMINATOR,
  POSITION_V2_OFFSETS,
} from "./meteora-dlmm-program.js";
import { meteoraLpFromLayout } from "./meteora-dlmm-read.js";

/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPositionLayout} MeteoraPositionLayout */
/** @typedef {{ readonly address: string; readonly owner: string; readonly bytes: Uint8Array }} ScannedPosition */
/** @typedef {{ readonly address: string; readonly layout: MeteoraPositionLayout }} FoundMeteora */

const base58 = getBase58Decoder();
/** Kit brands memcmp bytes; the decoder returns a plain string. */
const POSITION_V2_DISCRIMINATOR_B58 = /** @type {any} */ (
  base58.decode(Uint8Array.from(POSITION_V2_DISCRIMINATOR))
);

/** @param {string} position @param {string} reason */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/**
 * Official filters: discriminator at 0, owner pubkey at byte 40.
 * @param {string} owner
 */
const positionFilters = (owner) => [
  {
    memcmp: {
      offset: 0n,
      bytes: POSITION_V2_DISCRIMINATOR_B58,
      encoding: /** @type {"base58"} */ ("base58"),
    },
  },
  {
    memcmp: {
      offset: BigInt(POSITION_V2_OFFSETS.owner),
      bytes: /** @type {any} */ (owner),
      encoding: /** @type {"base58"} */ ("base58"),
    },
  },
];

/**
 * @param {AccountRead} read
 * @param {string} owner
 */
const ownedPositionAccounts = (read, owner) =>
  rpcCall("getProgramAccounts", read.origin, () =>
    read.rpc
      .getProgramAccounts(address(METEORA_DLMM_PROGRAM), {
        encoding: "base64",
        filters: positionFilters(owner),
      })
      .send({ abortSignal: AbortSignal.timeout(read.timeoutMs) }),
  );

/**
 * @param {{ pubkey: string; account: { owner: string; data: Parameters<typeof base64AccountData>[0] } }} row
 * @returns {ScannedPosition}
 */
const scannedPosition = (row) => ({
  address: row.pubkey,
  owner: row.account.owner,
  bytes: base64AccountData(row.account.data),
});

/**
 * A program-owned account that matched the scan and still does not decode fails the
 * whole enumeration. Skipping it would report a partial set.
 * @param {string} owner
 * @param {ScannedPosition} row
 * @returns {Effect.Effect<FoundMeteora, LiquidityPositionUnavailable>}
 */
const decodeOwnedPosition = (owner, row) => {
  if (row.owner !== METEORA_DLMM_PROGRAM) {
    return Effect.fail(
      unavailable(row.address, "position account is not owned by the pinned Meteora DLMM program"),
    );
  }
  const decoded = decodePositionV2(row.bytes);
  if (decoded.status !== "decoded") return Effect.fail(unavailable(row.address, decoded.reason));
  if (decoded.layout.owner !== owner) {
    return Effect.fail(
      unavailable(row.address, "position owner does not match the requested owner"),
    );
  }
  return Effect.succeed({ address: row.address, layout: decoded.layout });
};

/**
 * @param {AccountRead} read
 * @param {import("@solos/core").LiquidityListPositionsRequest} request
 * @returns {Effect.Effect<import("@solos/core").LiquidityEnumeration, import("@solos/core").LiquidityError | import("@solos/core").RpcError>}
 */
export const listMeteoraPositionsLive = (read, request) =>
  Effect.gen(function* () {
    const rows = yield* ownedPositionAccounts(read, request.owner);
    if (rows.length > MAX_POSITION_CANDIDATES) {
      return yield* new LiquidityEnumerationIncomplete({
        reason: "owner holds more than 256 candidate positions",
      });
    }
    const found = yield* Effect.forEach(
      rows,
      (row) => decodeOwnedPosition(request.owner, scannedPosition(row)),
      { concurrency: 1 },
    );
    const positions = yield* Effect.forEach(
      found,
      (item) => meteoraLpFromLayout(read, item.address, item.layout),
      { concurrency: 1 },
    );
    return { positions, perpAccounts: [], receiptMints: [] };
  });
