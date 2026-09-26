// @ts-check
/**
 * PositionV2 / LbPair / bin-share math. Amounts are the pinned `calculate_out_amount`:
 * floor(share * reserve / supply) per side, then summed. The liquidity figure is the exact
 * share sum and is allowed to pass u128 when the protocol is meteora.
 */
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  binArrayIndexOf,
  binOffset,
  positionWindow,
  shareOfBin,
  sumBinAmounts,
} from "./meteora-dlmm-bins.js";
import {
  meteoraBinArrayBytes,
  meteoraPairBytes,
  meteoraPositionBytes,
} from "./meteora-dlmm-bytes.js";
import { binSlot, decodeBinArray, decodeLbPair, decodePositionV2 } from "./meteora-dlmm-decode.js";
import { POSITION_V2_DISCRIMINATOR } from "./meteora-dlmm-program.js";
import { toMeteoraLpPosition } from "./meteora-dlmm-read.js";

const PAIR = "11111111111111111111111111111111";
const OWNER = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MINT_X = "So11111111111111111111111111111111111111112";
const MINT_Y = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const positionBytes = (overrides = {}) =>
  meteoraPositionBytes({
    lbPair: PAIR,
    owner: OWNER,
    lowerBinId: -1,
    upperBinId: 0,
    shares: [
      { index: 0, share: 3n },
      { index: 1, share: 5n },
    ],
    ...overrides,
  });

describe("meteora dlmm bin math", () => {
  test("bin ids floor-divide into arrays, including negatives", () => {
    expect(binArrayIndexOf(-71)).toBe(-2);
    expect(binArrayIndexOf(-70)).toBe(-1);
    expect(binArrayIndexOf(-1)).toBe(-1);
    expect(binArrayIndexOf(0)).toBe(0);
    expect(binArrayIndexOf(69)).toBe(0);
    expect(binArrayIndexOf(70)).toBe(1);
    expect(binOffset(-1)).toBe(69);
    expect(binOffset(-70)).toBe(0);
    expect(binOffset(69)).toBe(69);
  });

  test("a share takes floor(share * reserve / supply) on each side", () => {
    expect(shareOfBin(3n, 10n, 4n)).toEqual({ status: "ok", amount: 7n });
    expect(shareOfBin(5n, 10n, 8n)).toEqual({ status: "ok", amount: 6n });
    expect(shareOfBin(5n, 1n, 8n)).toEqual({ status: "ok", amount: 0n });
    expect(shareOfBin(1n, 1n, 0n)).toMatchObject({
      status: "corrupt",
      reason: "bin liquidity supply is zero",
    });
    expect(shareOfBin(5n, 1n, 4n)).toMatchObject({
      status: "corrupt",
      reason: "bin liquidity share exceeds the bin supply",
    });
  });

  test("occupied bins sum the floored sides and the raw shares", () => {
    const summed = sumBinAmounts(
      [
        { binId: -1, share: 3n },
        { binId: 0, share: 5n },
      ],
      (binId) =>
        binId === -1
          ? { amountX: 0n, amountY: 10n, liquiditySupply: 4n }
          : { amountX: 10n, amountY: 1n, liquiditySupply: 8n },
    );
    expect(summed).toEqual({ status: "ok", amountX: 6n, amountY: 7n });
  });

  test("the share sum may exceed u128 and still satisfies LpPosition", async () => {
    const max = (1n << 128n) - 1n;
    const shares = Array.from({ length: 70 }, () => max);
    const window = positionWindow({ lowerBinId: 0, upperBinId: 69, shares });
    expect(window.status).toBe("ok");
    if (window.status !== "ok") return;
    expect(window.liquidity).toBe(max * 70n);
    const parsed = await Effect.runPromise(
      toMeteoraLpPosition(PAIR, {
        layout: {
          lbPair: PAIR,
          owner: OWNER,
          lowerBinId: 0,
          upperBinId: 69,
          liquidity: window.liquidity,
          bins: [],
        },
        pair: { tokenMintX: MINT_X, tokenMintY: MINT_Y, activeId: 0, binStep: 1 },
        amounts: { amountX: 0n, amountY: 0n },
        decimals: { decimalsX: 9, decimalsY: 6 },
      }),
    );
    expect(parsed.liquidity).toBe((max * 70n).toString());
    expect(parsed.protocol).toBe("meteora");
  });
});

describe("meteora dlmm decode guards", () => {
  test("a position decodes its owner, pair, and in-window share sum", () => {
    const read = decodePositionV2(positionBytes());
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.layout.lbPair).toBe(PAIR);
    expect(read.layout.owner).toBe(OWNER);
    expect(read.layout.liquidity).toBe(8n);
    expect(read.layout.bins).toEqual([
      { binId: -1, share: 3n },
      { binId: 0, share: 5n },
    ]);
  });

  test("a short position is refused before the discriminator is considered", () => {
    const bytes = positionBytes({ bytes: 80 });
    bytes.set(new Uint8Array(POSITION_V2_DISCRIMINATOR), 0);
    expect(decodePositionV2(bytes)).toMatchObject({
      status: "corrupt",
      reason: "position account is shorter than the PositionV2 layout",
    });
  });

  test("the wrong discriminator is its own guard", () => {
    expect(decodePositionV2(positionBytes({ discriminator: new Uint8Array(8) }))).toMatchObject({
      status: "corrupt",
      reason: "position data does not carry the PositionV2 discriminator",
    });
  });

  test("an inverted window, a window past 70 bins, and a share outside it are corrupt", () => {
    expect(positionWindow({ lowerBinId: 2, upperBinId: 1, shares: [] })).toMatchObject({
      reason: "position bin window is inverted",
    });
    expect(positionWindow({ lowerBinId: 0, upperBinId: 70, shares: [] })).toMatchObject({
      reason: "position bin window does not fit the share array",
    });
    expect(positionWindow({ lowerBinId: 0, upperBinId: 0, shares: [0n, 1n] })).toMatchObject({
      reason: "liquidity share sits outside the position bin window",
    });
  });

  test("an LbPair decodes token X then token Y, and refuses a short or foreign body", () => {
    const read = decodeLbPair(
      meteoraPairBytes({ mintX: MINT_X, mintY: MINT_Y, activeId: -5291, binStep: 4 }),
    );
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.layout).toMatchObject({
      tokenMintX: MINT_X,
      tokenMintY: MINT_Y,
      activeId: -5291,
      binStep: 4,
    });
    expect(
      decodeLbPair(meteoraPairBytes({ mintX: MINT_X, mintY: MINT_Y, bytes: 40 })),
    ).toMatchObject({ reason: "referenced pair is shorter than the LbPair layout" });
    expect(
      decodeLbPair(
        meteoraPairBytes({ mintX: MINT_X, mintY: MINT_Y, discriminator: new Uint8Array(8) }),
      ),
    ).toMatchObject({ reason: "referenced pair does not carry the LbPair discriminator" });
  });

  test("a bin array slot round-trips the reserves used for the share", () => {
    const bytes = meteoraBinArrayBytes({
      lbPair: PAIR,
      index: -1,
      bins: [{ binId: -1, amountX: 0n, amountY: 10n, supply: 4n }],
    });
    const read = decodeBinArray(bytes);
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.layout.index).toBe(-1);
    expect(read.layout.lbPair).toBe(PAIR);
    expect(binSlot(read.layout, binOffset(-1))).toEqual({
      amountX: 0n,
      amountY: 10n,
      liquiditySupply: 4n,
    });
  });

  test("an absent account is its own corrupt reason", () => {
    expect(decodePositionV2(null)).toMatchObject({ reason: "no account at the position address" });
    expect(decodeLbPair(null)).toMatchObject({ reason: "referenced pair is missing" });
  });
});
