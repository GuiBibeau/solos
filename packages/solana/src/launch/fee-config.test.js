// @ts-check
/**
 * The fee schedule a pump trade is priced against.
 *
 * This is the arithmetic that decides the on-chain floor, so the cases that matter are the ones
 * where getting it wrong still looks fine: a schedule read from the wrong place produces a
 * plausible number, and a slippage default wide enough to absorb the error hides it until
 * someone tightens the bound.
 */
import { describe, expect, test } from "bun:test";
import {
  bondingCurveMarketCap,
  decodeFeeConfig,
  feeTierAt,
  mintSupply,
  resolveFeeBps,
} from "./fee-config.js";
import { feeConfigBytes, mintBytesWithSupply } from "./test-fixtures.js";

const TIERS = [
  { threshold: 0n, protocolFeeBps: 95n, creatorFeeBps: 30n },
  { threshold: 1_000_000_000_000n, protocolFeeBps: 60n, creatorFeeBps: 20n },
  { threshold: 5_000_000_000_000n, protocolFeeBps: 30n, creatorFeeBps: 10n },
];

/** The curve shape the market cap is computed from. */
const curve = {
  virtualQuoteReserves: 30_000_000_000n,
  virtualTokenReserves: 1_073_000_000_000_000n,
};
const global = { feeBasisPoints: 95n, creatorFeeBasisPoints: 5n };

describe("pump fee schedule", () => {
  test("the live mainnet table decodes to one tier charging 125 bps from zero", () => {
    const read = decodeFeeConfig(feeConfigBytes());
    expect(read.status).toBe("decoded");
    if (read.status !== "decoded") return;
    expect(read.tiers).toEqual([{ threshold: 0n, protocolFeeBps: 95n, creatorFeeBps: 30n }]);
  });

  test("a u128 threshold survives beyond the 64-bit boundary", () => {
    const big = (1n << 80n) + 7n;
    const read = decodeFeeConfig(
      feeConfigBytes([{ threshold: big, protocolFeeBps: 1n, creatorFeeBps: 2n }]),
    );
    expect(read.status === "decoded" && read.tiers[0]?.threshold).toBe(big);
  });

  test("market cap is virtual SOL times mint supply over virtual tokens", () => {
    expect(
      bondingCurveMarketCap({
        mintSupply: 1_000_000_000_000_000n,
        virtualQuoteReserves: 30_000_000_000n,
        virtualTokenReserves: 1_073_000_000_000_000n,
      }),
    ).toBe(27_958_993_476n);
  });

  test("a curve with no virtual tokens yields zero rather than dividing by it", () => {
    expect(
      bondingCurveMarketCap({
        mintSupply: 1n,
        virtualQuoteReserves: 1n,
        virtualTokenReserves: 0n,
      }),
    ).toBe(0n);
  });

  test("a market cap below the first threshold takes the first tier", () => {
    const tiers = TIERS.map((t) => ({ ...t, threshold: t.threshold + 100n }));
    expect(feeTierAt(tiers, 0n)).toBe(tiers[0]);
  });

  test("each tier applies from its own threshold up to the next", () => {
    expect(feeTierAt(TIERS, 0n)).toBe(TIERS[0]);
    expect(feeTierAt(TIERS, 999_999_999_999n)).toBe(TIERS[0]);
    expect(feeTierAt(TIERS, 1_000_000_000_000n)).toBe(TIERS[1]);
    expect(feeTierAt(TIERS, 4_999_999_999_999n)).toBe(TIERS[1]);
    expect(feeTierAt(TIERS, 5_000_000_000_000n)).toBe(TIERS[2]);
    expect(feeTierAt(TIERS, 1n << 100n)).toBe(TIERS[2]);
  });

  test("the resolved fee is the tier's protocol plus creator rate", () => {
    const resolved = resolveFeeBps({
      feeConfig: decodeFeeConfig(feeConfigBytes()),
      global,
      curve,
      supply: 1_000_000_000_000_000n,
    });
    expect(resolved).toEqual({ ok: true, totalFeeBps: 125n });
  });

  // The defect this module exists for: Global's retired fields and the curve's own creator rate
  // give 95 where the program charges 125. A 30 bps shortfall sets the enforced floor too high,
  // so every trade at 30 bps slippage or tighter reverts while the 50 bps default hides it.
  test("the tier table wins over Global's retired fee fields", () => {
    const fromTable = resolveFeeBps({
      feeConfig: decodeFeeConfig(feeConfigBytes()),
      global,
      curve,
      supply: 1_000_000_000_000_000n,
    });
    const fromRetiredFields = global.feeBasisPoints + 0n;
    expect(fromTable.ok && fromTable.totalFeeBps).toBe(125n);
    expect(fromTable.ok && fromTable.totalFeeBps - fromRetiredFields).toBe(30n);
  });

  test("no fee config at all falls back to Global's own two rates, never the curve's", () => {
    const resolved = resolveFeeBps({
      feeConfig: { status: "absent" },
      global,
      curve,
      supply: 1_000_000_000_000_000n,
    });
    expect(resolved).toEqual({ ok: true, totalFeeBps: 100n });
  });

  test("a present but unreadable fee config refuses instead of pricing on the old schedule", () => {
    for (const bytes of [new Uint8Array(69), feeConfigBytes().slice(0, 80)]) {
      expect(decodeFeeConfig(bytes).status).toBe("corrupt");
      const resolved = resolveFeeBps({
        feeConfig: decodeFeeConfig(bytes),
        global,
        curve,
        supply: 1n,
      });
      expect(resolved.ok).toBe(false);
    }
  });

  test("an empty tier table is corrupt, not a zero fee", () => {
    expect(decodeFeeConfig(feeConfigBytes([])).status).toBe("corrupt");
  });

  test("a mint too short to carry a supply refuses rather than pricing on a guess", () => {
    expect(mintSupply(new Uint8Array(40))).toBeUndefined();
    const resolved = resolveFeeBps({
      feeConfig: decodeFeeConfig(feeConfigBytes()),
      global,
      curve,
      supply: undefined,
    });
    expect(resolved.ok).toBe(false);
  });

  test("the supply read is the mint's own, which differs from the curve's total supply", () => {
    // Measured on mainnet: the live coin carried 2e15 on its mint and 1e15 on its curve.
    expect(mintSupply(mintBytesWithSupply(2_000_000_000_000_000n))).toBe(2_000_000_000_000_000n);
  });
});
