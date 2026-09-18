// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { getAddressDecoder } from "@solana/kit";
import { getToken } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { ensureSurfnet, randomSeed, USDC_MINT } from "../surfnet/test-surfnet.js";
import { seedTokenFixtures, setClassicMint, WSOL_MINT } from "./test-seeds.js";

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

/**
 * @param {string} mint
 * @returns {Promise<object>} the tagged domain error the read failed with
 */
const readFailure = async (mint) => {
  const exit = await Effect.runPromiseExit(getToken({ mint }).pipe(Effect.provide(layer)));
  if (exit._tag !== "Failure") throw new Error(`expected reading ${mint} to fail`);
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure))
    throw new Error(`expected a domain error, got a defect: ${String(exit.cause)}`);
  return /** @type {object} */ (failure.value);
};

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

  test("an extended token-2022 account (AccountType 2 at 165) passed as a mint is UnknownToken", async () => {
    await expect(readFailure(fx.token2022ExtendedAccount)).resolves.toMatchObject({
      _tag: "UnknownToken",
      mint: fx.token2022ExtendedAccount,
    });
  });

  test("non-zero padding before the AccountType byte is invalid layout, never a mint", async () => {
    await expect(readFailure(fx.token2022BadPadding)).resolves.toMatchObject({
      _tag: "UnknownToken",
    });
  });

  test("a truncated TLV header fails as invalid layout", async () => {
    await expect(readFailure(fx.token2022TruncatedTlv)).resolves.toMatchObject({
      _tag: "TokenMetadataUnavailable",
    });
  });

  test("a TLV value length crossing the account end fails as invalid layout", async () => {
    await expect(readFailure(fx.token2022OverrunTlv)).resolves.toMatchObject({
      _tag: "TokenMetadataUnavailable",
    });
  });

  test("an unsupported pointer target fails as metadata-unavailable", async () => {
    await expect(readFailure(fx.token2022WrongPointer)).resolves.toMatchObject({
      _tag: "TokenMetadataUnavailable",
    });
  });

  test("absent metadata on a non-canonical mint is metadata-unavailable, never invented", async () => {
    await expect(readFailure(fx.bareClassic)).resolves.toMatchObject({
      _tag: "TokenMetadataUnavailable",
    });
  });

  test("wSOL seeded with wrong decimals must not map canonically", async () => {
    await setClassicMint(surfnet.rpcUrl, WSOL_MINT, 6);
    await expect(readFailure(WSOL_MINT)).resolves.toMatchObject({
      _tag: "TokenMetadataUnavailable",
    });
    await setClassicMint(surfnet.rpcUrl, WSOL_MINT, 9);
    await expect(read(WSOL_MINT)).resolves.toMatchObject({ symbol: "wSOL" });
  });

  test("a token account passed as a mint is UnknownToken", async () => {
    await expect(readFailure(fx.tokenAccountAsMint)).resolves.toMatchObject({
      _tag: "UnknownToken",
      mint: fx.tokenAccountAsMint,
    });
  });

  test("a wrong-owner account is UnknownToken", async () => {
    await expect(readFailure(fx.wrongOwner)).resolves.toMatchObject({ _tag: "UnknownToken" });
  });

  test("a nonexistent address is UnknownToken", async () => {
    const missing = randomAddress();
    await expect(readFailure(missing)).resolves.toMatchObject({
      _tag: "UnknownToken",
      mint: missing,
    });
  });

  test("metadata claiming another mint fails instead of leaking a ticker", async () => {
    await expect(readFailure(fx.wrongMintMetadata)).resolves.toMatchObject({
      _tag: "TokenMetadataUnavailable",
    });
  });

  test("an oversized account fails promptly without decoding", async () => {
    await expect(readFailure(fx.oversized)).resolves.toMatchObject({
      _tag: "TokenMetadataUnavailable",
    });
  });

  test("decimals outside the public schema are metadata-unavailable", async () => {
    await expect(readFailure(fx.decimalsTooHigh)).resolves.toMatchObject({
      _tag: "TokenMetadataUnavailable",
    });
  });
});
