// @ts-check
/**
 * Seeds one running Surfnet with the full mint-metadata fixture family, all synthetic and
 * offline: raw accounts written through the `surfnet_setAccount` cheatcode, bytes built by
 * `test-fixtures.js` from the programs' verified layouts. Every write is awaited before any
 * address is returned, so fixture errors propagate and readers never race setup.
 */
import { getAddressDecoder } from "@solana/kit";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { metadataPda } from "./metaplex-metadata.js";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./mint-account.js";
import { base16, classicMintBytes, zeros } from "./test-fixtures.js";
import { WSOL_MINT, seedClassicFixtures, seedMetaplexFixtures } from "./test-seed-families.js";
import { token2022SeedAccounts } from "./token-2022-seeds.js";

export { WSOL_MINT } from "./test-seed-families.js";
/** @typedef {import("./test-seed-families.js").TokenFixtureAddresses} TokenFixtureAddresses */

const RENT_LAMPORTS = 1_461_600;

const addressFromBytes = getAddressDecoder();
/** A fresh, never-funded address; nothing else on the Surfnet holds it. */
const randomAddress = () => addressFromBytes.decode(crypto.getRandomValues(new Uint8Array(32)));

/**
 * Overwrite one address with a classic SPL mint at the given decimals — used to prove the
 * canonical gate reacts to on-chain decimals, not to the address alone.
 * @param {string} rpcUrl @param {string} mint @param {number} decimals
 */
export const setClassicMint = (rpcUrl, mint, decimals) =>
  accountWriter(rpcUrl)(mint, TOKEN_PROGRAM, classicMintBytes({ decimals }));

/** Keep a bare canonical fixture bare even on an online fork. @param {string} rpcUrl @param {string} mint */
const excludeCanonicalMetadata = async (rpcUrl, mint) => {
  const pda = await metadataPda(mint);
  // Clear previously fetched metadata, then block only this PDA from remote downloads.
  await jsonRpc(rpcUrl, "surfnet_resetAccount", [pda]);
  await jsonRpc(rpcUrl, "surfnet_offlineAccount", [pda]);
};

/** Curied raw-account writer for one Surfnet. @param {string} rpcUrl */
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

/**
 * Seed the fixture family. Canonical wSOL/USDC are seeded as bare classic mints with their
 * documented decimals (9 and 6). Their metadata PDAs stay absent on online forks too;
 * otherwise real Metaplex data would bypass the canonical fallback under test.
 * @param {string} rpcUrl
 * @param {string} usdcMint
 * @returns {Promise<TokenFixtureAddresses>}
 */
export const seedTokenFixtures = async (rpcUrl, usdcMint) => {
  const fixtures = {
    classicWithMetaplex: randomAddress(),
    token2022WithExtension: randomAddress(),
    token2022RealShape: randomAddress(),
    token2022TailPadding: randomAddress(),
    token2022WrongPointer: randomAddress(),
    token2022ExtendedAccount: randomAddress(),
    token2022BadPadding: randomAddress(),
    token2022TruncatedTlv: randomAddress(),
    token2022OverrunTlv: randomAddress(),
    tokenAccountAsMint: randomAddress(),
    wrongOwner: randomAddress(),
    wrongMintMetadata: randomAddress(),
    oversized: randomAddress(),
    decimalsTooHigh: randomAddress(),
    bareClassic: randomAddress(),
  };
  const setAccount = accountWriter(rpcUrl);
  const write = /** @param {string} owner @param {{ account: string; data: Uint8Array }} seed */ (
    owner,
    seed,
  ) => setAccount(seed.account, owner, seed.data);
  await setAccount(usdcMint, TOKEN_PROGRAM, classicMintBytes({ decimals: 6 }));
  await seedClassicFixtures(setAccount, fixtures);
  await Promise.all([WSOL_MINT, usdcMint].map((mint) => excludeCanonicalMetadata(rpcUrl, mint)));
  await Promise.all(
    token2022SeedAccounts(fixtures, WSOL_MINT).map((seed) => write(TOKEN_2022_PROGRAM, seed)),
  );
  await seedMetaplexFixtures(setAccount, fixtures);
  return fixtures;
};
