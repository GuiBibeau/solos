// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { expectedCurve, startLaunchVenueFixture } from "./launch-venue-fixture.js";

/**
 * Successful launch-curve reads over the real adapter stack against the seeded offline
 * Surfnet: full, legacy, and padded layouts decode to the exact contract fields.
 */

/** @type {Awaited<ReturnType<typeof startLaunchVenueFixture>>} */
let fx;

beforeAll(async () => {
  fx = await startLaunchVenueFixture();
});

describe("launch curve reads over seeded Surfnet [integration]", () => {
  test("a fresh curve decodes with 0 bps and exact u64 reserve strings", async () => {
    expect(await fx.readCurve(fx.mints.fresh)).toEqual(expectedCurve(fx.mints.fresh));
  });

  test("a 35%-sold curve decodes to exactly 3500 bps", async () => {
    expect(await fx.readCurve(fx.mints.partial)).toEqual(
      expectedCurve(fx.mints.partial, { progressBps: 3500 }),
    );
  });

  test("a completed curve is a successful read with complete=true and 10000 bps", async () => {
    expect(await fx.readCurve(fx.mints.completed)).toEqual(
      expectedCurve(fx.mints.completed, { complete: true, progressBps: 10_000 }),
    );
  });

  test("a legacy 49-byte curve decodes without the trailing fields", async () => {
    expect(await fx.readCurve(fx.mints.legacy49)).toEqual(expectedCurve(fx.mints.legacy49));
  });

  test("a legacy 83-byte curve ignores variant flags in the progress math", async () => {
    expect(await fx.readCurve(fx.mints.legacy83)).toEqual(expectedCurve(fx.mints.legacy83));
  });

  test("a padded 150-byte curve decodes identically to its 125-byte body", async () => {
    expect(await fx.readCurve(fx.mints.padded)).toEqual(expectedCurve(fx.mints.padded));
  });
});
