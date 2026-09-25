// @ts-check
/**
 * Every refusal a Raydium add or remove can make, decided over a stubbed reader so each one is
 * provable without a chain — the same shape as the Whirlpool plan tests.
 */
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { raydiumDepositPlan, raydiumWithdrawPlan } from "./raydium-clmm-plan.js";
import {
  PERSONAL_POSITION_BYTES,
  PERSONAL_POSITION_DISCRIMINATOR,
  POOL_STATE_DISCRIMINATOR,
  RAYDIUM_CLMM_PROGRAM,
} from "./raydium-clmm-program.js";

const OWNER = "D8ZDjWpJL83gR72eAQDGoRhE8Ryi9Cpamyms74xxevUt";
const POSITION = "66o3kiYMgs7ws8wqMKNdP9yiAZcxr4y5DfjsUiyd9EcS";
const POOL = "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv";
const NFT_ACCOUNT = "4uisq4ndD2eLNqaKm27UzQJBKQ4LHs9D92mZg9z5kttd";

const addressFill = (/** @type {number} */ byte) => new Uint8Array(32).fill(byte);

const positionBytes = ({ liquidity = 24_012_912_330n, lower = -21_878, upper = -20_877 } = {}) => {
  const bytes = new Uint8Array(PERSONAL_POSITION_BYTES);
  bytes.set(PERSONAL_POSITION_DISCRIMINATOR, 0);
  const view = new DataView(bytes.buffer);
  bytes.set(addressFill(5), 9);
  bytes.set(POOL_ID_BYTES, 41);
  view.setInt32(73, lower, true);
  view.setInt32(77, upper, true);
  view.setBigUint64(81, BigInt.asUintN(64, liquidity), true);
  view.setBigUint64(89, liquidity >> 64n, true);
  return bytes;
};

/** The 32 raw bytes of POOL, so the position and the pool agree on identity. */
const POOL_ID_BYTES = (() => {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const character of POOL) value = value * 58n + BigInt(alphabet.indexOf(character));
  const bytes = new Uint8Array(32);
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(BigInt.asUintN(8, value));
    value >>= 8n;
  }
  return bytes;
})();

const poolBytes = ({ tickSpacing = 1, tickCurrent = -21_146 } = {}) => {
  const bytes = new Uint8Array(273);
  bytes.set(POOL_STATE_DISCRIMINATOR, 0);
  const view = new DataView(bytes.buffer);
  bytes.set(addressFill(1), 73); // mint0
  bytes.set(addressFill(2), 105); // mint1
  bytes.set(addressFill(3), 137); // vault0
  bytes.set(addressFill(4), 169); // vault1
  bytes[233] = 9;
  bytes[234] = 6;
  view.setUint16(235, tickSpacing, true);
  // sqrt price at roughly tick -21146, the live value.
  view.setBigUint64(253, 6_408_684_130_492_330_473n, true);
  view.setBigUint64(261, 0n, true);
  view.setInt32(269, tickCurrent, true);
  return bytes;
};

/** A reader over an address map, with a custody answer. */
const readerFor = (rows, custody = NFT_ACCOUNT) => ({
  rows: (/** @type {readonly string[]} */ accounts) =>
    Effect.succeed(accounts.map((account) => rows.get(account) ?? null)),
  custody: () => Effect.succeed(custody),
});

const healthy = () =>
  new Map([
    [POSITION, { owner: RAYDIUM_CLMM_PROGRAM, bytes: positionBytes() }],
    [POOL, { owner: RAYDIUM_CLMM_PROGRAM, bytes: poolBytes() }],
  ]);

const depositAt = (rows, over = {}, custody = NFT_ACCOUNT) =>
  Effect.runPromise(
    raydiumDepositPlan({
      reader: /** @type {any} */ (readerFor(rows, custody)),
      owner: OWNER,
      action: {
        pool: POOL,
        position: POSITION,
        amountA: 1_000_000_000n,
        amountB: 1_000_000_000n,
        maxSlippageBps: 50,
        ...over,
      },
    }),
  );

const withdrawAt = (rows, over = {}, custody = NFT_ACCOUNT) =>
  Effect.runPromise(
    raydiumWithdrawPlan({
      reader: /** @type {any} */ (readerFor(rows, custody)),
      owner: OWNER,
      action: { position: POSITION, bps: 5000, maxSlippageBps: 50, ...over },
    }),
  );

describe("raydium deposit plan", () => {
  test("a healthy add derives every account the instruction lists", async () => {
    const plan = await depositAt(healthy());
    expect(plan.status).toBe("ok");
    if (plan.status !== "ok") return;
    expect(plan.liquidity).toBeGreaterThan(0n);
    expect(plan.accounts.personalPosition).toBe(POSITION);
    expect(plan.accounts.poolState).toBe(POOL);
    expect(plan.accounts.nftAccount).toBe(NFT_ACCOUNT);
    // The budgets are the on-chain maxima, passed through unchanged.
    expect(plan.tokenMaxA).toBe(1_000_000_000n);
    expect(plan.tokenMaxB).toBe(1_000_000_000n);
  });

  test("a position in a different pool than the one given is refused", async () => {
    const plan = await depositAt(healthy(), { pool: OWNER });
    expect(plan).toMatchObject({
      status: "reject",
      reason: "the position belongs to a different pool than the one given",
    });
  });

  test("an owner without the position NFT is refused before any quote", async () => {
    const plan = await depositAt(healthy(), {}, null);
    expect(plan).toMatchObject({
      status: "reject",
      reason: "owner does not hold the position NFT",
    });
  });

  test("a missing position and a foreign-owned one refuse at their own guards", async () => {
    expect(await depositAt(new Map())).toMatchObject({
      status: "reject",
      reason: "no account at the position address",
    });
    const foreign = healthy();
    foreign.set(POSITION, { owner: OWNER, bytes: positionBytes() });
    expect(await depositAt(foreign)).toMatchObject({
      status: "reject",
      reason: "position account is not owned by the pinned Raydium CLMM program",
    });
  });

  test("budgets that buy no liquidity are refused rather than built", async () => {
    const plan = await depositAt(healthy(), { amountA: 0n, amountB: 0n });
    expect(plan).toMatchObject({ status: "reject" });
  });

  test("a narrow range needs no bitmap extension; a far one does", async () => {
    const near = await depositAt(healthy());
    expect(near.status === "ok" && near.accounts.bitmapExtension).toBeUndefined();
    const far = healthy();
    far.set(POSITION, {
      owner: RAYDIUM_CLMM_PROGRAM,
      bytes: positionBytes({ lower: -60_000, upper: -59_000 }),
    });
    const plan = await depositAt(far);
    expect(plan.status === "ok" && typeof plan.accounts.bitmapExtension).toBe("string");
  });
});

describe("raydium withdraw plan", () => {
  test("a partial removal quotes a fraction and keeps both minimums", async () => {
    const plan = await withdrawAt(healthy());
    expect(plan.status).toBe("ok");
    if (plan.status !== "ok") return;
    expect(plan.liquidity).toBeLessThan(24_012_912_330n);
    expect(plan.minA).toBeLessThanOrEqual(plan.estA);
    expect(plan.minB).toBeLessThanOrEqual(plan.estB);
  });

  // Computing floor(L * 10000 / 10000) can lose a unit, and a position left holding dust cannot
  // be closed. A full exit must pass the stored value verbatim.
  test("a full exit passes the stored liquidity exactly", async () => {
    const plan = await withdrawAt(healthy(), { bps: 10_000 });
    expect(plan.status === "ok" && plan.liquidity).toBe(24_012_912_330n);
  });

  test("a removal that computes to zero liquidity is refused", async () => {
    const tiny = healthy();
    tiny.set(POSITION, { owner: RAYDIUM_CLMM_PROGRAM, bytes: positionBytes({ liquidity: 1n }) });
    expect(await withdrawAt(tiny, { bps: 1 })).toMatchObject({ status: "reject" });
  });

  test("an owner without the NFT cannot remove", async () => {
    expect(await withdrawAt(healthy(), {}, null)).toMatchObject({
      status: "reject",
      reason: "owner does not hold the position NFT",
    });
  });
});
