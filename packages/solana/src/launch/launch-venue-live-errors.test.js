// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { bondingCurveAddress } from "./bonding-curve.js";
import { USDC_QUOTE_MINT } from "./fixture-accounts.js";
import { startLaunchVenueFixture } from "./launch-venue-fixture.js";

/**
 * Failure reads over the real adapter stack against the seeded offline Surfnet: absent,
 * impostor, malformed, and unsupported-quote curves fail with their distinct tagged errors
 * and never decode into a successful response.
 */

/** @type {Awaited<ReturnType<typeof startLaunchVenueFixture>>} */
let fx;

beforeAll(async () => {
  fx = await startLaunchVenueFixture();
});

describe("launch curve failure reads over seeded Surfnet [integration]", () => {
  test("an absent curve fails CurveUnavailable and names its derived PDA", async () => {
    const failure = /** @type {any} */ (await fx.readCurve(fx.mints.absent));
    expect(failure).toMatchObject({
      _tag: "CurveUnavailable",
      mint: fx.mints.absent,
      curveAddress: await bondingCurveAddress(fx.mints.absent),
    });
  });

  test("an impostor account at the PDA (wrong owner) fails CurveCorrupt", async () => {
    const failure = /** @type {any} */ (await fx.readCurve(fx.mints.wrongOwner));
    expect(failure._tag).toBe("CurveCorrupt");
    expect(failure.reason).toBe("curve account is not owned by the pinned pump program");
  });

  test("a wrong discriminator fails CurveCorrupt", async () => {
    const failure = /** @type {any} */ (await fx.readCurve(fx.mints.wrongDiscriminator));
    expect(failure._tag).toBe("CurveCorrupt");
    expect(failure.reason).toBe("curve data does not carry the BondingCurve discriminator");
  });

  test("a truncated curve fails CurveCorrupt, never decodes as legacy", async () => {
    const failure = /** @type {any} */ (await fx.readCurve(fx.mints.truncated));
    expect(failure._tag).toBe("CurveCorrupt");
    expect(failure.reason).toBe("curve account is truncated below the legacy layout minimum");
  });

  test("a non-Borsh `complete` byte (0xff) fails CurveCorrupt, never a truthy read", async () => {
    const failure = /** @type {any} */ (await fx.readCurve(fx.mints.badCompleteByte));
    expect(failure._tag).toBe("CurveCorrupt");
    expect(failure.reason).toBe("curve field complete is a boolean byte that is neither 0 nor 1");
  });

  test("an invalid trailing boolean byte (is_holder_reward) fails CurveCorrupt", async () => {
    const failure = /** @type {any} */ (await fx.readCurve(fx.mints.badTrailingBool));
    expect(failure._tag).toBe("CurveCorrupt");
    expect(failure.reason).toBe(
      "curve field is_holder_reward is a boolean byte that is neither 0 nor 1",
    );
  });

  test("a USDC-paired curve fails UnsupportedQuoteAsset with the offending quote mint", async () => {
    expect(await fx.readCurve(fx.mints.unsupportedQuote)).toMatchObject({
      _tag: "UnsupportedQuoteAsset",
      mint: fx.mints.unsupportedQuote,
      quoteMint: USDC_QUOTE_MINT,
    });
  });
});
