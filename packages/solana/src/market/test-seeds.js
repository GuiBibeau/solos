// @ts-check
/**
 * Seeds one running Surfnet with the full mint-metadata fixture family, all synthetic and
 * offline: raw accounts written through the `surfnet_setAccount` cheatcode, bytes built by
 * `test-fixtures.js` from the programs' verified layouts. Returns the addresses so tests can
 * read them back through the real adapter, CLI, or MCP server.
 */
import { address, getAddressDecoder, getAddressEncoder } from "@solana/kit";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { METAPLEX_PROGRAM, metadataPda } from "./metaplex-metadata.js";
import { TOKEN_PROGRAM } from "./mint-account.js";
import {
  base16,
  classicMintBytes,
  concat,
  metaplexV1Bytes,
  token2022MintBytes,
  tokenMetadataValue,
  tlvRecord,
  zeros,
} from "./test-fixtures.js";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
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

/** @typedef {{ readonly classicWithMetaplex: string; readonly token2022WithExtension: string; readonly token2022WrongPointer: string; readonly tokenAccountAsMint: string; readonly wrongOwner: string; readonly wrongMintMetadata: string; readonly oversized: string; readonly decimalsTooHigh: string; readonly bareClassic: string }} TokenFixtureAddresses */

/** @typedef {(account: string, owner: string, data: Uint8Array) => Promise<unknown>} AccountWriter */

/** Classic-program fixtures: metadata-bearing, impostor, wrong owner, oversized, odd decimals. @param {AccountWriter} setAccount @param {TokenFixtureAddresses} fx */
const seedClassicFixtures = (setAccount, fx) => {
  setAccount(WSOL_MINT, TOKEN_PROGRAM, classicMintBytes({ decimals: 9 }));
  setAccount(fx.classicWithMetaplex, TOKEN_PROGRAM, classicMintBytes({ decimals: 6 }));
  setAccount(fx.wrongMintMetadata, TOKEN_PROGRAM, classicMintBytes({ decimals: 6 }));
  setAccount(fx.tokenAccountAsMint, TOKEN_PROGRAM, zeros(165));
  setAccount(fx.wrongOwner, SYSTEM_PROGRAM, classicMintBytes({ decimals: 9 }));
  setAccount(fx.decimalsTooHigh, TOKEN_PROGRAM, classicMintBytes({ decimals: 20 }));
  setAccount(fx.bareClassic, TOKEN_PROGRAM, classicMintBytes({ decimals: 4 }));
};

/** Token-2022 fixtures: in-mint metadata with a logo pair, a foreign pointer, an oversized account. @param {AccountWriter} setAccount @param {TokenFixtureAddresses} fx */
const seedToken2022Fixtures = (setAccount, fx) => {
  setAccount(
    fx.token2022WithExtension,
    TOKEN_2022_PROGRAM,
    token2022MintBytes({
      decimals: 8,
      records: [
        tlvRecord(18, zeros(64)),
        tlvRecord(
          19,
          tokenMetadataValue({
            mintBytes: mintBytes(fx.token2022WithExtension),
            name: "Fixture Cat",
            symbol: "FCAT",
            uri: "https://fixture.example/cat.json",
            pairs: [["logo", "https://fixture.example/cat.png"]],
          }),
        ),
      ],
    }),
  );
  setAccount(
    fx.token2022WrongPointer,
    TOKEN_2022_PROGRAM,
    token2022MintBytes({
      decimals: 8,
      records: [tlvRecord(18, concat(zeros(32), mintBytes(WSOL_MINT)))],
    }),
  );
  setAccount(fx.oversized, TOKEN_2022_PROGRAM, zeros(20_000));
};

/** Metaplex PDA fixtures: real metadata for one fixture mint, impostor metadata for another. @param {AccountWriter} setAccount @param {TokenFixtureAddresses} fx */
const seedMetaplexFixtures = async (setAccount, fx) => {
  setAccount(
    await metadataPda(fx.classicWithMetaplex),
    METAPLEX_PROGRAM,
    metaplexV1Bytes({
      mintBytes: mintBytes(fx.classicWithMetaplex),
      name: "Fixture Dog\0\0",
      symbol: "FDOG\0",
      uri: "https://fixture.example/dog.json",
    }),
  );
  setAccount(
    await metadataPda(fx.wrongMintMetadata),
    METAPLEX_PROGRAM,
    metaplexV1Bytes({
      mintBytes: mintBytes(fx.token2022WithExtension),
      name: "Impostor",
      symbol: "IMP",
      uri: "",
    }),
  );
};

/**
 * Seed the fixture family. Canonical wSOL/USDC are seeded as bare classic mints with their
 * documented decimals (9 and 6); everything else is a fresh random address.
 * @param {string} rpcUrl
 * @param {string} usdcMint
 * @returns {Promise<TokenFixtureAddresses>}
 */
export const seedTokenFixtures = async (rpcUrl, usdcMint) => {
  const fixtures = {
    classicWithMetaplex: randomAddress(),
    token2022WithExtension: randomAddress(),
    token2022WrongPointer: randomAddress(),
    tokenAccountAsMint: randomAddress(),
    wrongOwner: randomAddress(),
    wrongMintMetadata: randomAddress(),
    oversized: randomAddress(),
    decimalsTooHigh: randomAddress(),
    bareClassic: randomAddress(),
  };
  const setAccount = accountWriter(rpcUrl);
  setAccount(usdcMint, TOKEN_PROGRAM, classicMintBytes({ decimals: 6 }));
  seedClassicFixtures(setAccount, fixtures);
  seedToken2022Fixtures(setAccount, fixtures);
  await seedMetaplexFixtures(setAccount, fixtures);
  return fixtures;
};
