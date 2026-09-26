// @ts-check
/**
 * Deposit refusals decided over a stubbed reader, so each one is provable without a chain.
 */
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../market/mint-account.js";
import { tlvRecord, token2022MintBytes, zeros } from "../market/test-fixtures.js";
import { mintBytes } from "./liquidity-token-fixture.js";
import { binArrayAddress } from "./meteora-dlmm-bins.js";
import {
  meteoraBinArrayBytes,
  meteoraPairBytes,
  meteoraPositionBytes,
} from "./meteora-dlmm-bytes.js";
import { meteoraDepositPlan } from "./meteora-dlmm-deposit-plan.js";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

const OWNER = "D8ZDjWpJL83gR72eAQDGoRhE8Ryi9Cpamyms74xxevUt";
const OTHER = "66o3kiYMgs7ws8wqMKNdP9yiAZcxr4y5DfjsUiyd9EcS";
const POSITION = "D3eZCYdUE2uCRkQGx3k1dMTq9UEihhW2CSmdKR7ZQ4dp";
const PAIR = "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv";
const MINT_X = "So11111111111111111111111111111111111111112";
const MINT_Y = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RESERVE_X = "4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A";
const RESERVE_Y = "5it83u57VRrVgc51oNV19TTmAJuffPx5GtGwQr7gQNUo";

/** @param {string} owner @param {Uint8Array} bytes */
const row = (owner, bytes) => ({ owner, bytes });

/** @param {number} activeId */
const pairBytes = (activeId) =>
  meteoraPairBytes({
    mintX: MINT_X,
    mintY: MINT_Y,
    activeId,
    binStep: 1,
    reserveX: RESERVE_X,
    reserveY: RESERVE_Y,
  });

/** @param {string} [owner] */
const positionBytes = (owner = OWNER) =>
  meteoraPositionBytes({ lbPair: PAIR, owner, lowerBinId: 0, upperBinId: 0 });

/**
 * @param {Map<string, { owner: string; bytes: Uint8Array }>} map
 * @param {ReadonlyArray<{ owner: string; bytes: Uint8Array }>} [pairReads]
 */
const readerFor = (map, pairReads = []) => {
  let seen = 0;
  return {
    rows: (/** @type {readonly string[]} */ keys) =>
      Effect.succeed(
        keys.map((key) => {
          if (key !== PAIR || seen >= pairReads.length) return map.get(key) ?? null;
          const next = pairReads[seen];
          seen += 1;
          return next ?? null;
        }),
      ),
  };
};

/** @param {Map<string, { owner: string; bytes: Uint8Array }>} map @param {Record<string, unknown>} [action] */
const planOf = (map, action = {}) =>
  Effect.runPromise(
    meteoraDepositPlan({
      reader: readerFor(map),
      owner: OWNER,
      action: {
        pool: PAIR,
        position: POSITION,
        amountA: 1_000_000n,
        amountB: 2_000_000n,
        maxSlippageBps: 50,
        ...action,
      },
    }),
  );

/** @param {string} binArray */
const fundedMap = (binArray) =>
  new Map([
    [POSITION, row(METEORA_DLMM_PROGRAM, positionBytes())],
    [PAIR, row(METEORA_DLMM_PROGRAM, pairBytes(0))],
    [MINT_X, row(TOKEN_PROGRAM, mintBytes(9))],
    [MINT_Y, row(TOKEN_PROGRAM, mintBytes(6))],
    [binArray, row(METEORA_DLMM_PROGRAM, meteoraBinArrayBytes({ lbPair: PAIR, index: 0 }))],
  ]);

describe("meteora deposit plan", () => {
  test("a matching position quotes the fitted caps and names the position account", async () => {
    const binArray = await binArrayAddress(PAIR, 0);
    const plan = await planOf(fundedMap(binArray));
    expect(plan.status).toBe("ok");
    if (plan.status !== "ok") return;
    expect(plan.accounts.position).toBe(POSITION);
    expect(plan.accounts.sender).toBe(OWNER);
    expect(plan.accounts.binArrays).toEqual([binArray]);
    expect(plan.accounts.bitmapExtension).toBe(METEORA_DLMM_PROGRAM);
    expect(plan.tokenMaxA).toBe(1_000_000n);
    expect(plan.tokenMaxB).toBe(1_000_000n);
    expect(plan.requiredA).toBe(1_000_000n);
    expect(plan.liquidity).toBe(2_000_000n);
    expect(plan.programs).toEqual({ tokenX: TOKEN_PROGRAM, tokenY: TOKEN_PROGRAM });
  });

  test("the signer, the pool, a fee mint, missing reserves, and a missing bin array are refused", async () => {
    const binArray = await binArrayAddress(PAIR, 0);
    const foreign = fundedMap(binArray);
    foreign.set(POSITION, row(METEORA_DLMM_PROGRAM, positionBytes(OTHER)));
    const unowned = await planOf(foreign);
    expect(unowned.status === "reject" && unowned.reason).toContain("does not own");

    const wrongPool = await planOf(fundedMap(binArray), { pool: MINT_X });
    expect(wrongPool.status === "reject" && wrongPool.reason).toContain("different pool");

    const fee = fundedMap(binArray);
    fee.set(
      MINT_X,
      row(
        TOKEN_2022_PROGRAM,
        token2022MintBytes({ decimals: 6, records: [tlvRecord(1, zeros(116))] }),
      ),
    );
    const feePlan = await planOf(fee);
    expect(feePlan.status === "reject" && feePlan.reason).toContain("transfer fee");

    const bare = fundedMap(binArray);
    bare.set(PAIR, row(METEORA_DLMM_PROGRAM, meteoraPairBytes({ mintX: MINT_X, mintY: MINT_Y })));
    const missingReserves = await planOf(bare);
    expect(missingReserves.status === "reject" && missingReserves.reason).toContain("reserves");

    const noArray = fundedMap(binArray);
    noArray.delete(binArray);
    const missingArray = await planOf(noArray);
    expect(missingArray.status === "reject" && missingArray.reason).toContain(
      "bin array is missing",
    );
  });

  test("active-bin drift past the slippage tolerance is refused before send, and a smaller move is kept", async () => {
    const binArray = await binArrayAddress(PAIR, 0);
    const map = fundedMap(binArray);
    map.delete(PAIR);
    const moved = await Effect.runPromise(
      meteoraDepositPlan({
        reader: readerFor(map, [
          row(METEORA_DLMM_PROGRAM, pairBytes(0)),
          row(METEORA_DLMM_PROGRAM, pairBytes(100)),
        ]),
        owner: OWNER,
        action: {
          pool: PAIR,
          position: POSITION,
          amountA: 1_000_000n,
          amountB: 2_000_000n,
          maxSlippageBps: 50,
        },
      }),
    );
    expect(moved.status === "reject" && moved.reason).toContain("active bin");
    expect(moved.status === "reject" && moved.reason).toContain("slippage");

    const held = await Effect.runPromise(
      meteoraDepositPlan({
        reader: readerFor(map, [
          row(METEORA_DLMM_PROGRAM, pairBytes(0)),
          row(METEORA_DLMM_PROGRAM, pairBytes(10)),
        ]),
        owner: OWNER,
        action: {
          pool: PAIR,
          position: POSITION,
          amountA: 1_000_000n,
          amountB: 2_000_000n,
          maxSlippageBps: 50,
        },
      }),
    );
    expect(held.status).toBe("ok");
    if (held.status !== "ok") return;
    expect(held.bins).toEqual([{ binId: 0, distributionX: 10_000, distributionY: 10_000 }]);
  });
});
