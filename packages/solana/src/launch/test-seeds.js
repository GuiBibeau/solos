// @ts-check
/**
 * Seeds one running Surfnet with the bonding-curve fixture family, all synthetic and offline:
 * raw accounts written through the `surfnet_setAccount` cheatcode, bytes built by
 * `test-fixtures.js` from the pinned IDL layout. The pump program itself is never invoked —
 * the reader only decodes accounts — so fixtures are safe under the pump owner. Each curve
 * fixture lives at its own mint's derived PDA, so seeds and reads can never drift.
 */
import { address, getAddressDecoder, getAddressEncoder } from "@solana/kit";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { bondingCurveAddress } from "./bonding-curve.js";
import { globalConfigAddress } from "./global-config.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { base16, bondingCurveBytes, globalConfigBytes } from "./test-fixtures.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const RENT_LAMPORTS = 1_461_600;
/** A curve trading against USDC instead of native SOL: outside the SOL-only MVP. */
export const USDC_QUOTE_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const addressFromBytes = getAddressDecoder();
const addressBytes = getAddressEncoder();
/** A fresh, never-funded address; nothing else on the Surfnet holds it. */
const randomAddress = () => addressFromBytes.decode(crypto.getRandomValues(new Uint8Array(32)));

/** A fresh, never-funded mint address, for tests that seed exactly what they read. */
export const randomCurveMint = randomAddress;
/** 32 bytes of an address as the layouts embed them. @param {string} mint */
const mintBytes = (mint) => new Uint8Array(addressBytes.encode(address(mint)));

/** @typedef {Parameters<typeof bondingCurveBytes>[0]} CurveBytesOptions */

/**
 * The fresh-curve reserves every fixture shares; progress expectations derive from them.
 * @param {CurveBytesOptions} [overrides]
 */
const freshCurveBytes = (overrides = {}) =>
  bondingCurveBytes({
    virtualTokenReserves: 1_073_000_000_000_000n,
    virtualQuoteReserves: 30_000_000_000n,
    realTokenReserves: 793_100_000_000_000n,
    realQuoteReserves: 1_000_000_000n,
    ...overrides,
  });

/**
 * Pure account map for a loopback JSON-RPC fixture — the same fixture family as
 * `seedLaunchFixtures`, but returned instead of written, for tests that serve
 * `getAccountInfo` from their own server.
 * @param {{ readonly fresh: string; readonly completed: string; readonly unsupportedQuote: string }} mints
 * @returns {Promise<Map<string, { owner: string; data: Uint8Array }>>}
 */
export const launchFixtureAccounts = async (mints) => {
  const accounts = new Map();
  /**
   * @param {string} mint
   * @param {Uint8Array} data
   */
  const put = async (mint, data) =>
    accounts.set(await bondingCurveAddress(mint), { owner: PUMP_PROGRAM, data });
  await put(mints.fresh, freshCurveBytes());
  await put(
    mints.completed,
    freshCurveBytes({ realTokenReserves: 0n, realQuoteReserves: 0n, complete: true }),
  );
  await put(mints.unsupportedQuote, freshCurveBytes({ quoteMint: mintBytes(USDC_QUOTE_MINT) }));
  accounts.set(await globalConfigAddress(), { owner: PUMP_PROGRAM, data: globalConfigBytes() });
  return accounts;
};

/**
 * Curied raw-account writer for one Surfnet.
 * @param {string} rpcUrl
 */
const accountWriter =
  (rpcUrl) =>
  /**
   * @param {string} account
   * @param {string} owner
   * @param {Uint8Array} data
   */
  (account, owner, data) =>
    jsonRpc(rpcUrl, "surfnet_setAccount", [
      account,
      { lamports: RENT_LAMPORTS, data: base16(data), owner, executable: false },
    ]);

/** @typedef {{ readonly fresh: string; readonly partial: string; readonly completed: string; readonly legacy49: string; readonly legacy83: string; readonly padded: string; readonly unsupportedQuote: string; readonly wrongOwner: string; readonly wrongDiscriminator: string; readonly truncated: string; readonly absent: string }} LaunchFixtureMints */

/** The documented fresh-curve reserves: full real reserves against the Global anchor. */
const FRESH_RESERVES = {
  virtualTokenReserves: 1_073_000_000_000_000n,
  virtualQuoteReserves: 30_000_000_000n,
  realTokenReserves: 793_100_000_000_000n,
  realQuoteReserves: 1_000_000_000n,
};

/** SOL-paired full-layout fixtures: fresh, partial (35% sold), completed, padded, errors. @param {(mint: string, data: Uint8Array, owner?: string) => Promise<unknown>} setCurve @param {LaunchFixtureMints} mints */
const seedCurveFixtures = (setCurve, mints) =>
  Promise.all([
    setCurve(mints.fresh, bondingCurveBytes({ ...FRESH_RESERVES })),
    setCurve(
      mints.partial,
      bondingCurveBytes({ ...FRESH_RESERVES, realTokenReserves: 515_515_000_000_000n }),
    ),
    setCurve(
      mints.completed,
      bondingCurveBytes({
        ...FRESH_RESERVES,
        realTokenReserves: 0n,
        realQuoteReserves: 0n,
        complete: true,
      }),
    ),
    setCurve(mints.legacy49, bondingCurveBytes({ ...FRESH_RESERVES, bytes: 49 })),
    setCurve(
      mints.legacy83,
      bondingCurveBytes({ ...FRESH_RESERVES, isMayhemMode: true, isCashbackCoin: true, bytes: 83 }),
    ),
    setCurve(mints.padded, bondingCurveBytes({ ...FRESH_RESERVES, bytes: 150 })),
    setCurve(
      mints.unsupportedQuote,
      bondingCurveBytes({ ...FRESH_RESERVES, quoteMint: mintBytes(USDC_QUOTE_MINT) }),
    ),
    setCurve(mints.wrongOwner, bondingCurveBytes({ ...FRESH_RESERVES }), SYSTEM_PROGRAM),
    setCurve(
      mints.wrongDiscriminator,
      bondingCurveBytes({ ...FRESH_RESERVES, discriminator: new Uint8Array(8).fill(255) }),
    ),
    setCurve(mints.truncated, bondingCurveBytes({ ...FRESH_RESERVES, bytes: 40 })),
  ]);

/**
 * Seed the fixture family: every curve at its own mint's PDA, the shared Global config at its
 * well-known address, and the absent mint's PDA reset and blocked from remote downloads.
 * @param {string} rpcUrl
 * @returns {Promise<LaunchFixtureMints>}
 */
export const seedLaunchFixtures = async (rpcUrl) => {
  const mints = {
    fresh: randomAddress(),
    partial: randomAddress(),
    completed: randomAddress(),
    legacy49: randomAddress(),
    legacy83: randomAddress(),
    padded: randomAddress(),
    unsupportedQuote: randomAddress(),
    wrongOwner: randomAddress(),
    wrongDiscriminator: randomAddress(),
    truncated: randomAddress(),
    absent: randomAddress(),
  };
  const setAccount = accountWriter(rpcUrl);
  /**
   * Write one curve fixture at its own mint's derived PDA.
   * @param {string} mint
   * @param {Uint8Array} data
   * @param {string} [owner]
   */
  const setCurve = async (mint, data, owner = PUMP_PROGRAM) =>
    setAccount(await bondingCurveAddress(mint), owner, data);
  await seedCurveFixtures(setCurve, mints);
  await setAccount(await globalConfigAddress(), PUMP_PROGRAM, globalConfigBytes());
  const absentPda = await bondingCurveAddress(mints.absent);
  await jsonRpc(rpcUrl, "surfnet_resetAccount", [absentPda]);
  await jsonRpc(rpcUrl, "surfnet_offlineAccount", [absentPda]);
  return mints;
};
