// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mapLendEnumeration, mapLendPosition } from "./kamino-position-map.js";

const MARKET = "7u3E9eLCHaapLe2p8qSj4wePkBdtWTBQdMvPf6VgN7bD";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RECEIPT = "So11111111111111111111111111111111111111112";
const RESERVE = "9wmHb2T6aP8fRZQzMdGNuLvjBPSCoTkE4Wc1HyY8UAoJ";
const OBLIGATION = "EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih";
const OTHER = "H3rKMXZXQkBNRuWfzfmSmCiZRSbVhFTcKEJoQZiw88pX";
const reserve = {
  address: RESERVE,
  mint: MINT,
  receiptMint: RECEIPT,
  decimals: 6,
  collateralPerLiquidity: "0.5",
};

describe("Kamino supply position mapping", () => {
  test("dedupes obligation identity, aggregates duplicate deposit slots, and never nets debt", async () => {
    const row = {
      address: OBLIGATION,
      market: MARKET,
      owner: OTHER,
      deposits: [
        { reserve: RESERVE, collateral: "100" },
        { reserve: RESERVE, collateral: "51" },
      ],
    };
    expect(mapLendPosition(reserve, [row, row], MARKET)).toMatchObject({
      amount: "302",
      positions: [OBLIGATION],
      valueUsd: null,
    });
    await expect(
      Effect.runPromise(
        mapLendEnumeration({ market: MARKET, reserves: [reserve], rows: [row, row] }),
      ),
    ).resolves.toMatchObject({
      positions: [{ amount: "302", positions: [OBLIGATION] }],
      receiptMints: [RECEIPT],
    });
  });

  test("returns a known reserve as zero and omits it from portfolio enumeration", async () => {
    expect(mapLendPosition(reserve, [], MARKET)).toMatchObject({ amount: "0", positions: [] });
    await expect(
      Effect.runPromise(mapLendEnumeration({ market: MARKET, reserves: [reserve], rows: [] })),
    ).resolves.toEqual({ positions: [], perpAccounts: [], receiptMints: [] });
  });

  test("fails conflicting duplicates and bounds instead of returning partial output", async () => {
    const base = { address: OBLIGATION, market: MARKET, owner: OTHER, deposits: [] };
    const conflict = { ...base, deposits: [{ reserve: RESERVE, collateral: "1" }] };
    const duplicate = Effect.runPromiseExit(
      mapLendEnumeration({ market: MARKET, reserves: [reserve], rows: [base, conflict] }),
    );
    expect((await duplicate)._tag).toBe("Failure");
    const overBound = Array.from({ length: 4097 }, (_, index) => ({
      ...base,
      address: String(index),
    }));
    expect(
      (
        await Effect.runPromiseExit(
          mapLendEnumeration({ market: MARKET, reserves: [reserve], rows: overBound }),
        )
      )._tag,
    ).toBe("Failure");
    const manyReserves = Array.from({ length: 257 }, (_, index) => ({
      ...reserve,
      address: `reserve${index}`,
    }));
    const manyDeposits = [
      {
        ...base,
        deposits: manyReserves.map((item) => ({ reserve: item.address, collateral: "1" })),
      },
    ];
    expect(
      (
        await Effect.runPromiseExit(
          mapLendEnumeration({
            market: MARKET,
            reserves: manyReserves,
            rows: manyDeposits,
          }),
        )
      )._tag,
    ).toBe("Failure");
    const unknown = [{ ...base, deposits: [{ reserve: OTHER, collateral: "1" }] }];
    expect(
      (
        await Effect.runPromiseExit(
          mapLendEnumeration({ market: MARKET, reserves: [reserve], rows: unknown }),
        )
      )._tag,
    ).toBe("Failure");
    expect(
      (
        await Effect.runPromiseExit(
          mapLendEnumeration({ market: MARKET, reserves: [reserve], rows: [], pages: 33 }),
        )
      )._tag,
    ).toBe("Failure");
  });
});
