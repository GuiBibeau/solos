// @ts-check
/**
 * Every refusal a Raydium add or remove can make, decided over a stubbed reader so each one is
 * provable without a chain — the same shape as the Whirlpool plan tests.
 */
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { classicMintBytes, tlvRecord, token2022MintBytes, zeros } from "../market/test-fixtures.js";
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

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** A plain 82-byte mint, the shape both token programs accept without extensions. */
const plainMintBytes = () => classicMintBytes({ decimals: 6 });

/** A token-2022 mint declaring TransferFeeConfig — what the plan must refuse. */
const feeBearingMintBytes = () =>
  token2022MintBytes({ decimals: 6, records: [tlvRecord(1, zeros(116))] });

/** The base58 address the decoder produces for a fill-byte account, so map keys line up. */
const addressOf = (/** @type {number} */ byte) => {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const part of addressFill(byte)) value = (value << 8n) + BigInt(part);
  let out = "";
  while (value > 0n) {
    out = alphabet[Number(value % 58n)] + out;
    value /= 58n;
  }
  return out;
};

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

/** RAY, the reward this pool really carries. */
const REWARD_MINT_BYTE = 7;
const REWARD_VAULT_BYTE = 8;

const poolBytes = ({ tickSpacing = 1, tickCurrent = -21_146, rewards = 0 } = {}) => {
  const bytes = new Uint8Array(397 + 169 * 3);
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
  for (let index = 0; index < rewards; index += 1) {
    const at = 397 + 169 * index;
    bytes[at] = 3; // an initialized (ended) reward still requires its accounts
    bytes.set(addressFill(REWARD_MINT_BYTE + index), at + 57);
    bytes.set(addressFill(REWARD_VAULT_BYTE + index), at + 89);
  }
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
    // The plan reads each pool mint to learn which token program owns it.
    [addressOf(1), { owner: TOKEN_PROGRAM_ID, bytes: plainMintBytes() }],
    [addressOf(2), { owner: TOKEN_PROGRAM_ID, bytes: plainMintBytes() }],
  ]);

/** The bound the planner must encode at 50 bps against a 1e9 budget. @param {bigint} required */
const boundAt50Bps = (required) => {
  const withTolerance = (required * 10_050n + 9999n) / 10_000n;
  return withTolerance < 1_000_000_000n ? withTolerance : 1_000_000_000n;
};

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
    // The on-chain maxima are the quote plus the requested tolerance, capped by the budget —
    // not the budget itself, which would make maxSlippageBps decorative.
    // A is the side the budget exhausts, so it caps; B is the side the quote decides.
    expect(plan.tokenMaxA).toBe(boundAt50Bps(plan.requiredA));
    expect(plan.tokenMaxB).toBe(boundAt50Bps(plan.requiredB));
    expect(plan.tokenMaxB).toBeLessThan(1_000_000_000n);
  });

  test("a pool mint that charges a transfer fee is refused, not quoted", async () => {
    const rows = healthy();
    rows.set(addressOf(2), {
      owner: TOKEN_2022_PROGRAM_ID,
      bytes: feeBearingMintBytes(),
    });
    const plan = await depositAt(rows);
    expect(plan).toMatchObject({ status: "reject" });
    expect(plan.reason).toContain("transfer fee");
  });

  test("a token-2022 pool mint without a fee is planned against its own program", async () => {
    const rows = healthy();
    rows.set(addressOf(2), { owner: TOKEN_2022_PROGRAM_ID, bytes: plainMintBytes() });
    const plan = await depositAt(rows);
    expect(plan.status).toBe("ok");
    expect(plan.programs).toMatchObject({
      token0: TOKEN_PROGRAM_ID,
      token1: TOKEN_2022_PROGRAM_ID,
    });
  });

  test("a zero tolerance encodes exactly the quoted spend", async () => {
    const plan = await depositAt(healthy(), { maxSlippageBps: 0 });
    expect(plan.status).toBe("ok");
    expect(plan.tokenMaxA).toBe(plan.requiredA);
    expect(plan.tokenMaxB).toBe(plan.requiredB);
  });

  test("a budget below the quote plus tolerance still caps the maximum", async () => {
    const plan = await depositAt(healthy(), { amountB: 1000n });
    expect(plan.status).toBe("ok");
    expect(plan.tokenMaxB).toBe(1000n);
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

  // The pool this fixture mirrors really does carry an initialized RAY reward, and
  // decrease_liquidity_v2 requires exactly three remaining accounts per initialized reward.
  // Passing none fails the removal outright, even when only liquidity was wanted.
  test("a pool with no rewards needs no groups", async () => {
    const plan = await withdrawAt(healthy());
    expect(plan.status === "ok" && plan.rewards).toEqual([]);
  });

  test("each initialized reward contributes one group, in reward index order", async () => {
    for (const count of [1, 2, 3]) {
      const rows = healthy();
      rows.set(POOL, { owner: RAYDIUM_CLMM_PROGRAM, bytes: poolBytes({ rewards: count }) });
      for (let index = 0; index < count; index += 1) {
        rows.set(addressOf(REWARD_MINT_BYTE + index), {
          owner: TOKEN_PROGRAM_ID,
          bytes: new Uint8Array(82),
        });
      }
      const plan = await withdrawAt(rows);
      expect(plan.status === "ok" && plan.rewards).toHaveLength(count);
    }
  });

  test("an owner without the NFT cannot remove", async () => {
    expect(await withdrawAt(healthy(), {}, null)).toMatchObject({
      status: "reject",
      reason: "owner does not hold the position NFT",
    });
  });
});
