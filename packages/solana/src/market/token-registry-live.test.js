// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { getAddressDecoder } from "@solana/kit";
import { getToken } from "@solos/core";
import { Effect } from "effect";
import { SolanaTestLive } from "../index.js";
import { ensureSurfnet, randomSeed, USDC_MINT } from "../surfnet/test-surfnet.js";
import { seedTokenFixtures, WSOL_MINT } from "./test-seeds.js";

/** A fresh, never-funded address; nothing on the Surfnet holds it. */
const randomAddress = () => getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof SolanaTestLive>} */
let layer;
/** @type {Awaited<ReturnType<typeof seedTokenFixtures>>} */
let fx;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  layer = SolanaTestLive({ ...surfnet, seed: randomSeed() });
  fx = await seedTokenFixtures(surfnet.rpcUrl, USDC_MINT);
});

/** @param {string} mint */
const read = (mint) => Effect.runPromise(getToken({ mint }).pipe(Effect.provide(layer)));

describe("TokenRegistry over the shared SolanaRpc [integration]", () => {
  test("a classic mint with Metaplex metadata returns verified name, symbol, decimals", async () => {
    await expect(read(fx.classicWithMetaplex)).resolves.toEqual({
      mint: fx.classicWithMetaplex,
      name: "Fixture Dog", // trailing NUL padding trimmed
      symbol: "FDOG",
      decimals: 6,
      logoUri: null,
    });
  });

  test("a token-2022 mint with in-mint metadata returns it, logo pair included", async () => {
    await expect(read(fx.token2022WithExtension)).resolves.toEqual({
      mint: fx.token2022WithExtension,
      name: "Fixture Cat",
      symbol: "FCAT",
      decimals: 8,
      logoUri: "https://fixture.example/cat.png",
    });
  });

  test("canonical wSOL and USDC map only after the on-chain mint and decimals verify", async () => {
    await expect(read(WSOL_MINT)).resolves.toMatchObject({
      name: "Wrapped SOL",
      symbol: "wSOL",
      decimals: 9,
    });
    await expect(read(USDC_MINT)).resolves.toMatchObject({
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
    });
  });

  test("a mint shaped exactly like a real extended chain mint decodes end to end", async () => {
    // base 82 + zero padding to 165 + AccountType 1 + TransferFeeConfig/pointer/metadata TLV
    await expect(read(fx.token2022RealShape)).resolves.toEqual({
      mint: fx.token2022RealShape,
      name: "Fixture Cat",
      symbol: "FCAT",
      decimals: 6,
      logoUri: "https://fixture.example/real.png",
    });
  });

  test("a tail-padding token-2022 mint without in-mint metadata falls back to Metaplex", async () => {
    // TransferFeeConfig record + the permitted two-byte type-zero padding tail; the walk must
    // end cleanly so the mint's valid Metaplex PDA is reached and read.
    await expect(read(fx.token2022TailPadding)).resolves.toEqual({
      mint: fx.token2022TailPadding,
      name: "Fixture Owl",
      symbol: "FOWL",
      decimals: 6,
      logoUri: null,
    });
  });
});
