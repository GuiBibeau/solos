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
import { USDC_QUOTE_MINT } from "./fixture-accounts.js";
import { globalConfigAddress } from "./global-config.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { base16, freshCurveBytes, globalConfigBytes } from "./test-fixtures.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const RENT_LAMPORTS = 1_461_600;

const addressFromBytes = getAddressDecoder();
const addressBytes = getAddressEncoder();
/** A fresh, never-funded address; nothing else on the Surfnet holds it. */
const randomAddress = () => addressFromBytes.decode(crypto.getRandomValues(new Uint8Array(32)));
/** 32 bytes of an address as the layouts embed them. @param {string} mint */
const mintBytes = (mint) => new Uint8Array(addressBytes.encode(address(mint)));

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

/** @typedef {{ readonly fresh: string; readonly partial: string; readonly completed: string; readonly legacy49: string; readonly legacy83: string; readonly padded: string; readonly badCompleteByte: string; readonly badTrailingBool: string; readonly unsupportedQuote: string; readonly wrongOwner: string; readonly wrongDiscriminator: string; readonly truncated: string; readonly partialQuoteMint: string; readonly absent: string }} LaunchFixtureMints */

/**
 * Malformed-boolean fixtures: a `complete` byte of 255 at the legacy minimum, and an
 * `is_holder_reward` byte of 0x02 in the full layout. A byte that is neither 0 nor 1 is
 * malformed data, never a truthy flag.
 * @param {() => Uint8Array} build
 * @param {number} offset
 * @param {number} value
 */
const badBooleanBytes = (build, offset, value) => {
  const bytes = build();
  bytes[offset] = value;
  return bytes;
};

/** The whole SOL-paired fixture family, each curve at its own mint's PDA. @param {(mint: string, data: Uint8Array, owner?: string) => Promise<unknown>} setCurve @param {LaunchFixtureMints} mints */
const seedCurveFixtures = (setCurve, mints) =>
  Promise.all([
    setCurve(mints.fresh, freshCurveBytes()),
    setCurve(mints.partial, freshCurveBytes({ realTokenReserves: 515_515_000_000_000n })),
    setCurve(
      mints.completed,
      freshCurveBytes({ realTokenReserves: 0n, realQuoteReserves: 0n, complete: true }),
    ),
    setCurve(mints.legacy49, freshCurveBytes({ bytes: 49 })),
    setCurve(
      mints.legacy83,
      freshCurveBytes({ isMayhemMode: true, isCashbackCoin: true, bytes: 83 }),
    ),
    setCurve(mints.padded, freshCurveBytes({ bytes: 150 })),
    setCurve(
      mints.badCompleteByte,
      badBooleanBytes(() => freshCurveBytes({ bytes: 49 }), 48, 255),
    ),
    setCurve(mints.badTrailingBool, badBooleanBytes(freshCurveBytes, 124, 0x02)),
    setCurve(mints.unsupportedQuote, freshCurveBytes({ quoteMint: mintBytes(USDC_QUOTE_MINT) })),
    setCurve(mints.wrongOwner, freshCurveBytes(), SYSTEM_PROGRAM),
    setCurve(
      mints.wrongDiscriminator,
      freshCurveBytes({ discriminator: new Uint8Array(8).fill(255) }),
    ),
    setCurve(mints.truncated, freshCurveBytes({ bytes: 40 })),
    // 100 bytes: the 83-byte legacy prefix plus 17 of quote_mint's 32.
    setCurve(mints.partialQuoteMint, freshCurveBytes({ bytes: 100 })),
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
    badCompleteByte: randomAddress(),
    badTrailingBool: randomAddress(),
    unsupportedQuote: randomAddress(),
    wrongOwner: randomAddress(),
    wrongDiscriminator: randomAddress(),
    truncated: randomAddress(),
    partialQuoteMint: randomAddress(),
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
