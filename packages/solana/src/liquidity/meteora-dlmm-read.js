// @ts-check
/**
 * Read one Meteora DLMM position, in protocol order: position guards, owner-field custody,
 * pair guards, bin arrays for occupied bins, mint decimals, then the pinned share math.
 *
 * Custody is the PositionV2 `owner` field at byte 40. There is no position NFT, so this
 * path does not call `holdsPositionNft`. Nothing here signs, sends, or prices.
 */
import { LiquidityPositionUnavailable, LpPositionSchema } from "@solos/core";
import { Effect } from "effect";
import { fetchAccount } from "../market/account-read.js";
import { base64AccountData } from "../market/mint-account.js";
import { fetchAccounts } from "./liquidity-accounts.js";
import { mintDecimals, mintDecimalsOrUnavailable } from "./liquidity-mint-read.js";
import { binArrayAddress, binArrayIndexOf, sumBinAmounts } from "./meteora-dlmm-bins.js";
import { binSlot, decodeBinArray, decodeLbPair, decodePositionV2 } from "./meteora-dlmm-decode.js";
import { BINS_PER_ARRAY, METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

/** @typedef {import("@solos/core").LiquidityGetPositionRequest} LiquidityGetPositionRequest */
/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPositionLayout} MeteoraPositionLayout */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPairLayout} MeteoraPairLayout */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraBinSlot} MeteoraBinSlot */
/** @typedef {import("./liquidity-accounts.js").FetchedAccount} FetchedAccount */
/** @typedef {import("@solos/core").LiquidityPositionUnavailable} Unavailable */
/** @typedef {{ readonly status: "corrupt"; readonly reason: string }} Corrupt */

/** @param {string} position @param {string} reason @returns {Unavailable} */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/** @param {string} reason @returns {Corrupt} */
const corrupt = (reason) => ({ status: "corrupt", reason });

/**
 * One guarded account read: present, owned by the pinned program, and decodable.
 * @template T
 * @param {AccountRead} read
 * @param {{ position: string; account: string; absent: string; foreign: string;
 *   decode: (bytes: Uint8Array | null) => { status: "decoded"; layout: T } | Corrupt }} parts
 */
const guardedRead = (read, parts) =>
  Effect.flatMap(fetchAccount(read, parts.account), (info) => {
    if (info === null) return Effect.fail(unavailable(parts.position, parts.absent));
    if (info.owner !== METEORA_DLMM_PROGRAM) {
      return Effect.fail(unavailable(parts.position, parts.foreign));
    }
    const guarded = parts.decode(base64AccountData(info.data));
    return guarded.status === "decoded"
      ? Effect.succeed(guarded.layout)
      : Effect.fail(unavailable(parts.position, guarded.reason));
  });

/**
 * @param {string} lbPair
 * @param {number} index
 * @param {FetchedAccount | null} row
 * @returns {{ status: "decoded"; layout: import("./meteora-dlmm-decode.js").MeteoraBinArrayLayout } | Corrupt}
 */
const guardBinArray = (lbPair, index, row) => {
  if (row === null) return corrupt("referenced bin array is missing");
  if (row.owner !== METEORA_DLMM_PROGRAM) {
    return corrupt("referenced bin array is not owned by the pinned Meteora DLMM program");
  }
  const decoded = decodeBinArray(row.bytes);
  if (decoded.status !== "decoded") return decoded;
  if (decoded.layout.index !== index) return corrupt("referenced bin array has the wrong index");
  if (decoded.layout.lbPair !== lbPair) {
    return corrupt("referenced bin array belongs to a different pair");
  }
  return decoded;
};

/**
 * @param {Map<number, MeteoraBinSlot>} slots
 * @param {import("./meteora-dlmm-decode.js").MeteoraBinArrayLayout} layout
 */
const rememberBins = (slots, layout) => {
  const base = layout.index * BINS_PER_ARRAY;
  for (let offset = 0; offset < BINS_PER_ARRAY; offset += 1) {
    slots.set(base + offset, binSlot(layout, offset));
  }
};

/**
 * @param {{ position: string; lbPair: string; indexes: readonly number[];
 *   rows: ReadonlyArray<FetchedAccount | null> }} batch
 */
const collectSlots = (batch) => {
  /** @type {Map<number, MeteoraBinSlot>} */
  const slots = new Map();
  for (const [at, index] of batch.indexes.entries()) {
    const guarded = guardBinArray(batch.lbPair, index, batch.rows[at] ?? null);
    if (guarded.status !== "decoded") {
      return Effect.fail(unavailable(batch.position, guarded.reason));
    }
    rememberBins(slots, guarded.layout);
  }
  return Effect.succeed(slots);
};

/**
 * @param {AccountRead} read
 * @param {string} position
 * @param {MeteoraPositionLayout} layout
 */
const underlying = (read, position, layout) => {
  if (layout.bins.length === 0) return Effect.succeed({ amountX: 0n, amountY: 0n });
  const indexes = [...new Set(layout.bins.map((bin) => binArrayIndexOf(bin.binId)))];
  return Effect.gen(function* () {
    const addresses = yield* Effect.promise(() =>
      Promise.all(indexes.map((index) => binArrayAddress(layout.lbPair, index))),
    );
    const rows = yield* fetchAccounts(read, addresses);
    const slots = yield* collectSlots({
      position,
      lbPair: layout.lbPair,
      indexes,
      rows,
    });
    const summed = sumBinAmounts(layout.bins, (binId) => slots.get(binId));
    if (summed.status !== "ok") return yield* Effect.fail(unavailable(position, summed.reason));
    return { amountX: summed.amountX, amountY: summed.amountY };
  });
};

/**
 * @param {string} position
 * @param {{ layout: MeteoraPositionLayout; pair: MeteoraPairLayout;
 *   amounts: { amountX: bigint; amountY: bigint }; decimals: { decimalsX: number; decimalsY: number } }} parts
 */
export const toMeteoraLpPosition = (position, parts) => {
  const parsed = LpPositionSchema.safeParse({
    kind: "lp",
    protocol: "meteora",
    position,
    instrument: parts.layout.lbPair,
    liquidity: parts.layout.liquidity.toString(),
    tokenA: {
      mint: parts.pair.tokenMintX,
      amount: parts.amounts.amountX.toString(),
      decimals: parts.decimals.decimalsX,
    },
    tokenB: {
      mint: parts.pair.tokenMintY,
      amount: parts.amounts.amountY.toString(),
      decimals: parts.decimals.decimalsY,
    },
    valueUsd: null,
  });
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(unavailable(position, "decoded position does not satisfy the position contract"));
};

/**
 * @param {AccountRead} read
 * @param {string} position
 * @param {MeteoraPairLayout} pair
 */
const pairDecimals = (read, position, pair) =>
  Effect.gen(function* () {
    const reads = yield* mintDecimals(read, [pair.tokenMintX, pair.tokenMintY]);
    return {
      decimalsX: yield* mintDecimalsOrUnavailable(position, pair.tokenMintX, reads),
      decimalsY: yield* mintDecimalsOrUnavailable(position, pair.tokenMintY, reads),
    };
  });

/**
 * Map an already-decoded PositionV2 into the LP contract for one point read. Owner
 * enumeration batches the same guards across positions instead of calling this per row.
 * @param {AccountRead} read
 * @param {string} position
 * @param {MeteoraPositionLayout} layout
 */
export const meteoraLpFromLayout = (read, position, layout) =>
  Effect.gen(function* () {
    const pair = yield* guardedRead(read, {
      position,
      account: layout.lbPair,
      absent: "referenced pair is missing",
      foreign: "referenced pair is not owned by the pinned Meteora DLMM program",
      decode: decodeLbPair,
    });
    const amounts = yield* underlying(read, position, layout);
    const decimals = yield* pairDecimals(read, position, pair);
    return yield* toMeteoraLpPosition(position, { layout, pair, amounts, decimals });
  });

/**
 * @param {AccountRead} read
 * @param {LiquidityGetPositionRequest} request
 */
export const getMeteoraPositionLive = (read, request) =>
  Effect.gen(function* () {
    const layout = yield* guardedRead(read, {
      position: request.position,
      account: request.position,
      absent: "no account at the position address",
      foreign: "position account is not owned by the pinned Meteora DLMM program",
      decode: decodePositionV2,
    });
    if (layout.owner !== request.owner) {
      return yield* Effect.fail(
        unavailable(request.position, "position owner does not match the requested owner"),
      );
    }
    return yield* meteoraLpFromLayout(read, request.position, layout);
  });
