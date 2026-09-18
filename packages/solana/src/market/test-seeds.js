// @ts-check
/**
 * Seeds one running Surfnet with the full mint-metadata fixture family, all synthetic and
 * offline: raw accounts written through the `surfnet_setAccount` cheatcode, bytes built by
 * `test-fixtures.js` from the programs' verified layouts. Every write is awaited before any
 * address is returned, so fixture errors propagate and readers never race setup.
 */
import { address, getAddressDecoder, getAddressEncoder } from "@solana/kit";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { METAPLEX_PROGRAM, metadataPda } from "./metaplex-metadata.js";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./mint-account.js";
import { base16, classicMintBytes, metaplexV1Bytes, zeros } from "./test-fixtures.js";
import { token2022SeedAccounts } from "./token-2022-seeds.js";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const RENT_LAMPORTS = 1_461_600;

const addressBytes = getAddressEncoder();
const addressFromBytes = getAddressDecoder();
/** A fresh, never-funded address; nothing else on the Surfnet holds it. */
const randomAddress = () => addressFromBytes.decode(crypto.getRandomValues(new Uint8Array(32)));
/** 32 bytes of an address as the metadata layouts embed them. @param {string} mint */
const mintBytes = (mint) => new Uint8Array(addressBytes.encode(address(mint)));

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

/** @typedef {{ readonly classicWithMetaplex: string; readonly token2022WithExtension: string; readonly token2022RealShape: string; readonly token2022TailPadding: string; readonly token2022WrongPointer: string; readonly token2022ExtendedAccount: string; readonly token2022BadPadding: string; readonly token2022TruncatedTlv: string; readonly token2022OverrunTlv: string; readonly tokenAccountAsMint: string; readonly wrongOwner: string; readonly wrongMintMetadata: string; readonly oversized: string; readonly decimalsTooHigh: string; readonly bareClassic: string }} TokenFixtureAddresses */

/** @typedef {(account: string, owner: string, data: Uint8Array) => Promise<unknown>} AccountWriter */

/** Classic-program fixtures: metadata-bearing, impostor, wrong owner, oversized, odd decimals. @param {AccountWriter} setAccount @param {TokenFixtureAddresses} fx */
const seedClassicFixtures = async (setAccount, fx) => {
  await Promise.all([
    setAccount(WSOL_MINT, TOKEN_PROGRAM, classicMintBytes({ decimals: 9 })),
    setAccount(fx.classicWithMetaplex, TOKEN_PROGRAM, classicMintBytes({ decimals: 6 })),
    setAccount(fx.wrongMintMetadata, TOKEN_PROGRAM, classicMintBytes({ decimals: 6 })),
    setAccount(fx.tokenAccountAsMint, TOKEN_PROGRAM, zeros(165)),
    setAccount(fx.wrongOwner, SYSTEM_PROGRAM, classicMintBytes({ decimals: 9 })),
    setAccount(fx.decimalsTooHigh, TOKEN_PROGRAM, classicMintBytes({ decimals: 20 })),
    setAccount(fx.bareClassic, TOKEN_PROGRAM, classicMintBytes({ decimals: 4 })),
  ]);
};

/** Metaplex PDA fixtures: real metadata for one fixture mint, impostor metadata for another. @param {AccountWriter} setAccount @param {TokenFixtureAddresses} fx */
const seedMetaplexFixtures = async (setAccount, fx) => {
  await Promise.all([
    metadataPda(fx.token2022TailPadding).then((pda) =>
      setAccount(
        pda,
        METAPLEX_PROGRAM,
        metaplexV1Bytes({
          mintBytes: mintBytes(fx.token2022TailPadding),
          name: "Fixture Owl",
          symbol: "FOWL",
          uri: "https://fixture.example/owl.json",
        }),
      ),
    ),
    metadataPda(fx.classicWithMetaplex).then((pda) =>
      setAccount(
        pda,
        METAPLEX_PROGRAM,
        metaplexV1Bytes({
          mintBytes: mintBytes(fx.classicWithMetaplex),
          name: "Fixture Dog\0\0",
          symbol: "FDOG\0",
          uri: "https://fixture.example/dog.json",
        }),
      ),
    ),
    // Impostor: metadata at this mint's PDA claiming the token-2022 fixture mint instead.
    metadataPda(fx.wrongMintMetadata).then((pda) =>
      setAccount(
        pda,
        METAPLEX_PROGRAM,
        metaplexV1Bytes({
          mintBytes: mintBytes(fx.token2022WithExtension),
          name: "Impostor",
          symbol: "IMP",
          uri: "",
        }),
      ),
    ),
  ]);
};

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
