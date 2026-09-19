// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { getCurve } from "@solos/core/launch";
import { Cause, Effect, Layer, Option } from "effect";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { LaunchVenueLive } from "../index.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { bondingCurveAddress } from "./bonding-curve.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { seedLaunchFixtures, USDC_QUOTE_MINT } from "./test-seeds.js";

/**
 * The full launch-curve read over the real adapter stack against the offline shared Surfnet,
 * seeded with synthetic accounts at each fixture mint's derived PDA plus the Global config.
 * The pump program is never invoked; accounts are written with the `surfnet_setAccount`
 * cheatcode, exactly like the market slice's fixtures.
 */

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {Awaited<ReturnType<typeof seedLaunchFixtures>>} */
let mints;
/** @type {Layer.Layer<LaunchVenueShape>} */
let layer;

/** @typedef {import("@solos/core/launch").LaunchVenueShape} LaunchVenueShape */

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  mints = await seedLaunchFixtures(surfnet.rpcUrl);
  layer = LaunchVenueLive({ timeoutMs: 10_000 }).pipe(
    Layer.provide(
      Layer.succeed(SolanaRpc, {
        url: surfnet.rpcUrl,
        rpc: createSolanaRpc(surfnet.rpcUrl),
        rpcSubscriptions: createSolanaRpcSubscriptions("ws://127.0.0.1:9"),
      }),
    ),
  );
});

/**
 * One read through the core use case and the live adapter. Returns the LaunchCurve on
 * success or the tagged domain error on failure.
 * @param {string} mint
 */
const readCurve = async (mint) => {
  const exit = await Effect.runPromiseExit(getCurve({ mint }).pipe(Effect.provide(layer)));
  if (exit._tag === "Failure") {
    const failure = Cause.failureOption(exit.cause);
    if (Option.isNone(failure)) throw new Error(`expected a domain error: ${String(exit.cause)}`);
    return /** @type {object} */ (failure.value);
  }
  return exit.value;
};

/** The fresh-curve body every SOL-paired full-layout fixture shares. */
const expectedCurve = (mint, overrides = {}) => ({
  mint,
  program: PUMP_PROGRAM,
  complete: false,
  progressBps: 0,
  virtualSolReserves: "30000000000",
  virtualTokenReserves: "1073000000000000",
  ...overrides,
});

describe("launch curve reads over seeded Surfnet [integration]", () => {
  test("a fresh curve decodes with 0 bps and exact u64 reserve strings", async () => {
    expect(await readCurve(mints.fresh)).toEqual(expectedCurve(mints.fresh));
  });

  test("a 35%-sold curve decodes to exactly 3500 bps", async () => {
    expect(await readCurve(mints.partial)).toEqual(
      expectedCurve(mints.partial, { progressBps: 3500 }),
    );
  });

  test("a completed curve is a successful read with complete=true and 10000 bps", async () => {
    expect(await readCurve(mints.completed)).toEqual(
      expectedCurve(mints.completed, { complete: true, progressBps: 10_000 }),
    );
  });

  test("a legacy 49-byte curve decodes without the trailing fields", async () => {
    expect(await readCurve(mints.legacy49)).toEqual(expectedCurve(mints.legacy49));
  });

  test("a legacy 83-byte curve ignores variant flags in the progress math", async () => {
    expect(await readCurve(mints.legacy83)).toEqual(expectedCurve(mints.legacy83));
  });

  test("a padded 150-byte curve decodes identically to its 125-byte body", async () => {
    expect(await readCurve(mints.padded)).toEqual(expectedCurve(mints.padded));
  });

  test("an absent curve fails CurveUnavailable and names its derived PDA", async () => {
    const failure = /** @type {any} */ (await readCurve(mints.absent));
    expect(failure).toMatchObject({
      _tag: "CurveUnavailable",
      mint: mints.absent,
      curveAddress: await bondingCurveAddress(mints.absent),
    });
  });

  test("an impostor account at the PDA (wrong owner) fails CurveCorrupt", async () => {
    const failure = /** @type {any} */ (await readCurve(mints.wrongOwner));
    expect(failure._tag).toBe("CurveCorrupt");
    expect(failure.reason).toBe("curve account is not owned by the pinned pump program");
  });

  test("a wrong discriminator fails CurveCorrupt", async () => {
    const failure = /** @type {any} */ (await readCurve(mints.wrongDiscriminator));
    expect(failure._tag).toBe("CurveCorrupt");
    expect(failure.reason).toBe("curve data does not carry the BondingCurve discriminator");
  });

  test("a truncated curve fails CurveCorrupt, never decodes as legacy", async () => {
    const failure = /** @type {any} */ (await readCurve(mints.truncated));
    expect(failure._tag).toBe("CurveCorrupt");
    expect(failure.reason).toBe("curve account is truncated below the legacy layout minimum");
  });

  test("a USDC-paired curve fails UnsupportedQuoteAsset with the offending quote mint", async () => {
    expect(await readCurve(mints.unsupportedQuote)).toMatchObject({
      _tag: "UnsupportedQuoteAsset",
      mint: mints.unsupportedQuote,
      quoteMint: USDC_QUOTE_MINT,
    });
  });
});
