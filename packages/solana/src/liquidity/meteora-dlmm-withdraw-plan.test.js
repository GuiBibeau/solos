// @ts-check
/**
 * Withdraw refusals and the remove-only quote, decided over a stubbed reader.
 */
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { TOKEN_PROGRAM } from "../market/mint-account.js";
import { mintBytes } from "./liquidity-token-fixture.js";
import { binArrayAddress } from "./meteora-dlmm-bins.js";
import {
  meteoraBinArrayBytes,
  meteoraPairBytes,
  meteoraPositionBytes,
} from "./meteora-dlmm-bytes.js";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";
import { meteoraWithdrawPlan } from "./meteora-dlmm-withdraw-plan.js";

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
  meteoraPositionBytes({
    lbPair: PAIR,
    owner,
    lowerBinId: 0,
    upperBinId: 2,
    shares: [
      { index: 0, share: 1000n },
      { index: 2, share: 400n },
    ],
  });

/** @param {Map<string, { owner: string; bytes: Uint8Array }>} map @param {Record<string, unknown>} [action] @param {ReadonlyArray<{ owner: string; bytes: Uint8Array }>} [pairReads] */
const planOf = (map, action = {}, pairReads = []) => {
  let seen = 0;
  return Effect.runPromise(
    meteoraWithdrawPlan({
      reader: {
        rows: (/** @type {readonly string[]} */ keys) =>
          Effect.succeed(
            keys.map((key) => {
              if (key !== PAIR || seen >= pairReads.length) return map.get(key) ?? null;
              const next = pairReads[seen];
              seen += 1;
              return next ?? null;
            }),
          ),
      },
      owner: OWNER,
      action: { position: POSITION, bps: 10_000, maxSlippageBps: 50, ...action },
    }),
  );
};

/** @param {string} binArray */
const fundedMap = (binArray) =>
  new Map([
    [POSITION, row(METEORA_DLMM_PROGRAM, positionBytes())],
    [PAIR, row(METEORA_DLMM_PROGRAM, pairBytes(0))],
    [MINT_X, row(TOKEN_PROGRAM, mintBytes(9))],
    [MINT_Y, row(TOKEN_PROGRAM, mintBytes(6))],
    [
      binArray,
      row(
        METEORA_DLMM_PROGRAM,
        meteoraBinArrayBytes({
          lbPair: PAIR,
          index: 0,
          bins: [
            { binId: 0, amountX: 1000n, amountY: 0n, supply: 1000n },
            { binId: 2, amountX: 0n, amountY: 800n, supply: 400n },
          ],
        }),
      ),
    ],
  ]);

describe("meteora withdraw plan", () => {
  test("a full exit removes every occupied bin at 10000 bps and leaves zero shares", async () => {
    const binArray = await binArrayAddress(PAIR, 0);
    const plan = await planOf(fundedMap(binArray));
    expect(plan.status).toBe("ok");
    if (plan.status !== "ok") return;
    expect(plan.accounts.position).toBe(POSITION);
    expect(plan.accounts.owner).toBe(OWNER);
    expect(plan.accounts.rentPayer).toBe(OWNER);
    expect(plan.accounts.binArrays).toEqual([binArray]);
    expect(plan.activeId).toBe(0);
    expect(plan.maxActiveBinSlippage).toBe(50);
    expect(plan.liquidity).toBe(1400n);
    expect(plan.estA).toBe(1000n);
    expect(plan.estB).toBe(800n);
    expect(plan.minA).toBe(995n);
    expect(plan.minB).toBe(796n);
    expect(plan.removes).toEqual([
      { binId: 0, bps: 10_000 },
      { binId: 2, bps: 10_000 },
    ]);
    expect(plan.remaining).toEqual([
      { binId: 0, share: 0n },
      { binId: 2, share: 0n },
    ]);
  });

  test("a partial remove keeps the floored remainder on each occupied bin", async () => {
    const binArray = await binArrayAddress(PAIR, 0);
    const plan = await planOf(fundedMap(binArray), { bps: 5000 });
    expect(plan.status).toBe("ok");
    if (plan.status !== "ok") return;
    expect(plan.removes).toEqual([
      { binId: 0, bps: 5000 },
      { binId: 2, bps: 5000 },
    ]);
    expect(plan.remaining).toEqual([
      { binId: 0, share: 500n },
      { binId: 2, share: 200n },
    ]);
    expect(plan.minA).toBe(497n);
    expect(plan.minB).toBe(398n);
  });

  test("a foreign owner, an empty position, and active-bin drift are refused", async () => {
    const binArray = await binArrayAddress(PAIR, 0);
    const foreign = fundedMap(binArray);
    foreign.set(POSITION, row(METEORA_DLMM_PROGRAM, positionBytes(OTHER)));
    const unowned = await planOf(foreign);
    expect(unowned.status === "reject" && unowned.reason).toContain("does not own");

    const empty = fundedMap(binArray);
    empty.set(
      POSITION,
      row(METEORA_DLMM_PROGRAM, meteoraPositionBytes({ lbPair: PAIR, owner: OWNER })),
    );
    const bare = await planOf(empty);
    expect(bare.status === "reject" && bare.reason).toContain("zero liquidity");

    const map = fundedMap(binArray);
    map.delete(PAIR);
    const moved = await planOf(map, {}, [
      row(METEORA_DLMM_PROGRAM, pairBytes(0)),
      row(METEORA_DLMM_PROGRAM, pairBytes(100)),
    ]);
    expect(moved.status === "reject" && moved.reason).toContain("active bin");
  });
});
