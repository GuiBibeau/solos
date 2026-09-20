// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { Effect } from "effect";
import { buildEnvelope, failureOf } from "./jupiter-swap-build-fixture.js";
import { fetchBuild } from "./jupiter-swap-build-response.js";

/**
 * The documented build envelope is the contract: fetchedAt in the official
 * `{secs_since_epoch, nanos_since_epoch}` shape parses and is stripped, a 32-byte blockhash
 * number array and an integer lastValidBlockHeight are required, and any malformed shape fails
 * as QuoteResponseInvalid instead of reaching validation. Served through a stubbed fetch —
 * the real endpoint is never contacted.
 */

/** @type {string} */
let taker;

beforeAll(async () => {
  const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(7));
  taker = signer.address;
});

/** @param {Record<string, unknown>} overrides */
const buildVia = async (overrides) => {
  const body = JSON.stringify({ ...(await buildEnvelope({ taker })), ...overrides });
  return fetchBuild(
    { inputMint: "a", outputMint: "b", amount: "1", slippageBps: 50, taker },
    { baseUrl: "https://jupiter.test", apiKey: "k", fetchImpl: async () => new Response(body) },
  );
};

describe("build envelope response contract", () => {
  test("the documented response with the official fetchedAt object parses, fetchedAt stripped", async () => {
    const envelope = await Effect.runPromise(await buildVia({}));
    expect(envelope.blockhashWithMetadata.fetchedAt).toBeUndefined();
    expect(envelope.blockhashWithMetadata.lastValidBlockHeight).toBe(4_294_967_296);
    expect(envelope.blockhashWithMetadata.blockhash).toHaveLength(32);
  });

  test("a fetchedAt missing a field is rejected", async () => {
    const blockhashWithMetadata = {
      blockhash: (await buildEnvelope({ taker })).blockhashWithMetadata.blockhash,
      lastValidBlockHeight: 1,
      fetchedAt: { secs_since_epoch: 1_700_000_000 },
    };
    const failure = await failureOf(await buildVia({ blockhashWithMetadata }));
    expect(failure).toMatchObject({ _tag: "QuoteResponseInvalid" });
  });

  test("a fetchedAt as a bare epoch number is rejected: that is not the documented shape", async () => {
    const blockhashWithMetadata = {
      ...(await buildEnvelope({ taker })).blockhashWithMetadata,
      fetchedAt: 1_700_000_000_000,
    };
    const failure = await failureOf(await buildVia({ blockhashWithMetadata }));
    expect(failure).toMatchObject({ _tag: "QuoteResponseInvalid" });
  });

  test("a 31-byte blockhash array is rejected", async () => {
    const blockhashWithMetadata = {
      ...(await buildEnvelope({ taker })).blockhashWithMetadata,
      blockhash: Array.from({ length: 31 }, () => 1),
    };
    const failure = await failureOf(await buildVia({ blockhashWithMetadata }));
    expect(failure).toMatchObject({ _tag: "QuoteResponseInvalid" });
  });

  test("a base58 blockhash string is rejected: the contract carries raw bytes", async () => {
    const blockhashWithMetadata = {
      ...(await buildEnvelope({ taker })).blockhashWithMetadata,
      blockhash: "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
    };
    const failure = await failureOf(await buildVia({ blockhashWithMetadata }));
    expect(failure).toMatchObject({ _tag: "QuoteResponseInvalid" });
  });

  test("a fractional lastValidBlockHeight is rejected", async () => {
    const blockhashWithMetadata = {
      ...(await buildEnvelope({ taker })).blockhashWithMetadata,
      lastValidBlockHeight: 1.5,
    };
    const failure = await failureOf(await buildVia({ blockhashWithMetadata }));
    expect(failure).toMatchObject({ _tag: "QuoteResponseInvalid" });
  });
});
