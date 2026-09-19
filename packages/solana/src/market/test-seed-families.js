// @ts-check
import { address, getAddressEncoder } from "@solana/kit";
import { METAPLEX_PROGRAM, metadataPda } from "./metaplex-metadata.js";
import { TOKEN_PROGRAM } from "./mint-account.js";
import { classicMintBytes, metaplexV1Bytes, zeros } from "./test-fixtures.js";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

const addressBytes = getAddressEncoder();
/** 32 bytes of an address as the metadata layouts embed them. @param {string} mint */
const mintBytes = (mint) => new Uint8Array(addressBytes.encode(address(mint)));

/** @typedef {{ readonly classicWithMetaplex: string; readonly token2022WithExtension: string; readonly token2022RealShape: string; readonly token2022TailPadding: string; readonly token2022WrongPointer: string; readonly token2022ExtendedAccount: string; readonly token2022BadPadding: string; readonly token2022TruncatedTlv: string; readonly token2022OverrunTlv: string; readonly tokenAccountAsMint: string; readonly wrongOwner: string; readonly wrongMintMetadata: string; readonly oversized: string; readonly decimalsTooHigh: string; readonly bareClassic: string }} TokenFixtureAddresses */

/** @typedef {(account: string, owner: string, data: Uint8Array) => Promise<unknown>} AccountWriter */

/** Classic-program fixtures: metadata-bearing, impostor, wrong owner, oversized, odd decimals. @param {AccountWriter} setAccount @param {TokenFixtureAddresses} fx */
export const seedClassicFixtures = async (setAccount, fx) => {
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
export const seedMetaplexFixtures = async (setAccount, fx) => {
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
