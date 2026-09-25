// @ts-check
/**
 * Every gate a buy must not pass, decided without a chain.
 *
 * `validateBuyReads` is pure over the three account reads, so each refusal the contract asks for
 * — a missing curve, a foreign owner, a completed curve, a non-SOL quote, an unreadable config —
 * is provable here rather than only in a funded round.
 */
import { describe, expect, test } from "bun:test";
import { getAddressEncoder, address } from "@solana/kit";
import { PUMP_BUY_REJECTIONS, validateBuyReads } from "./pump-buy-plan.js";
import { BONDING_CURVE_DISCRIMINATOR, PUMP_PROGRAM } from "./pump-program.js";
import { GLOBAL_TRADING_BYTES, tradingGlobalBytes } from "./test-fixtures.js";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const CREATOR = "7yecFGMRPmQcHUyrCRkQyDbTeBQhTBzE6LXZ9nQS3Mbq";
const OTHER_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const encoder = getAddressEncoder();

/** @param {Uint8Array} bytes */
const asAccount = (bytes, owner = PUMP_PROGRAM) => ({
  data: [Buffer.from(bytes).toString("base64"), "base64"],
  owner,
});

/** A 125-byte curve: reserves, flags, creator, quote mint, creator fee. */
const curveBytes = ({
  complete = false,
  quoteMint = new Uint8Array(32),
  creator = CREATOR,
} = {}) => {
  const bytes = new Uint8Array(125);
  bytes.set(BONDING_CURVE_DISCRIMINATOR, 0);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(8, 1_073_000_000_000_000n, true); // virtual token
  view.setBigUint64(16, 30_000_000_000n, true); // virtual quote
  view.setBigUint64(24, 793_100_000_000_000n, true); // real token
  bytes[48] = complete ? 1 : 0;
  bytes.set(new Uint8Array(encoder.encode(address(creator))), 49);
  bytes.set(quoteMint, 83);
  view.setBigUint64(115, 5n, true); // creator fee bps
  return bytes;
};

/** A Global long enough to carry the live fee fields. */
const globalBytes = () =>
  tradingGlobalBytes({
    feeRecipient: new Uint8Array(encoder.encode(address(OTHER_MINT))),
    buybackFeeRecipient: new Uint8Array(encoder.encode(address(CREATOR))),
  });

const mintAccount = asAccount(new Uint8Array(82), TOKEN_PROGRAM);

/** @param {Partial<{ curve: unknown; global: unknown; mint: unknown }>} overrides */
const validate = (overrides = {}) =>
  validateBuyReads(
    /** @type {any} */ ({
      curve: asAccount(curveBytes()),
      global: asAccount(globalBytes()),
      mint: mintAccount,
      ...overrides,
    }),
  );

describe("pump buy refusals", () => {
  test("the documented reads pass every gate", () => {
    const checked = validate();
    expect(checked.ok).toBe(true);
    // The fee is read live, never assumed: 95 protocol plus 5 creator, not the doc's 100.
    expect(checked.ok && checked.totalFeeBps).toBe(100n);
    expect(checked.ok && checked.tokenProgram).toBe(TOKEN_PROGRAM);
  });

  test("a missing curve is refused before anything else", () => {
    expect(validate({ curve: null })).toMatchObject({
      ok: false,
      reason: PUMP_BUY_REJECTIONS.CURVE_ABSENT,
    });
  });

  test("a curve owned by another program is refused", () => {
    expect(validate({ curve: asAccount(curveBytes(), TOKEN_PROGRAM) })).toMatchObject({
      ok: false,
      reason: PUMP_BUY_REJECTIONS.CURVE_MISOWNED,
    });
  });

  test("a completed curve is refused and never rerouted", () => {
    expect(validate({ curve: asAccount(curveBytes({ complete: true })) })).toMatchObject({
      ok: false,
      reason: PUMP_BUY_REJECTIONS.CURVE_COMPLETE,
    });
  });

  test("a curve quoted in anything but SOL is refused", () => {
    const quoteMint = new Uint8Array(encoder.encode(address(OTHER_MINT)));
    expect(validate({ curve: asAccount(curveBytes({ quoteMint })) })).toMatchObject({
      ok: false,
      reason: PUMP_BUY_REJECTIONS.NOT_SOL_QUOTED,
    });
  });

  test("a missing mint account is refused", () => {
    expect(validate({ mint: null })).toMatchObject({
      ok: false,
      reason: PUMP_BUY_REJECTIONS.MINT_ABSENT,
    });
  });

  test("an unreadable Global config is refused", () => {
    expect(validate({ global: asAccount(new Uint8Array(GLOBAL_TRADING_BYTES)) })).toMatchObject({
      ok: false,
      reason: PUMP_BUY_REJECTIONS.GLOBAL_CORRUPT,
    });
  });

  test("a Global too short for the live fee rates is refused rather than defaulted", () => {
    const short = globalBytes().slice(0, 120);
    expect(validate({ global: asAccount(short) })).toMatchObject({
      ok: false,
      reason: PUMP_BUY_REJECTIONS.GLOBAL_NO_FEES,
    });
  });

  test("a legacy curve without the creator field is refused, since the vault needs it", () => {
    const legacy = curveBytes().slice(0, 49);
    expect(validate({ curve: asAccount(legacy) })).toMatchObject({
      ok: false,
      reason: PUMP_BUY_REJECTIONS.CREATOR_ABSENT,
    });
  });
});
