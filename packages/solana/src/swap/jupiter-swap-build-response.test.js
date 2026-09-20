// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { getBase58Decoder } from "@solana/kit";
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";
import { BuildEnvelopeSchema } from "./jupiter-swap-build-response.js";

/**
 * The documented build envelope is the contract: fetchedAt in the official
 * `{secs_since_epoch, nanos_since_epoch}` shape parses and is stripped, a 32-byte blockhash
 * number array and an integer lastValidBlockHeight are required, and any malformed shape fails
 * schema parsing before any transport or executor is involved.
 */

/** @type {string} */
let taker;

beforeAll(async () => {
  const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(7));
  taker = signer.address;
});

/** @param {Record<string, unknown>} overrides */
const buildVia = async (overrides) =>
  BuildEnvelopeSchema.safeParse({ ...(await buildEnvelope({ taker })), ...overrides });

describe("build envelope response contract", () => {
  test("the documented response with the official fetchedAt object parses, fetchedAt stripped", async () => {
    const parsed = await buildVia({});
    if (!parsed.success) throw new Error("documented envelope did not parse");
    const envelope = parsed.data;
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
    expect((await buildVia({ blockhashWithMetadata })).success).toBe(false);
  });

  test("a fetchedAt as a bare epoch number is rejected: that is not the documented shape", async () => {
    const blockhashWithMetadata = {
      ...(await buildEnvelope({ taker })).blockhashWithMetadata,
      fetchedAt: 1_700_000_000_000,
    };
    expect((await buildVia({ blockhashWithMetadata })).success).toBe(false);
  });

  test("a 31-byte blockhash array is rejected", async () => {
    const blockhashWithMetadata = {
      ...(await buildEnvelope({ taker })).blockhashWithMetadata,
      blockhash: Array.from({ length: 31 }, () => 1),
    };
    expect((await buildVia({ blockhashWithMetadata })).success).toBe(false);
  });

  test("a base58 blockhash string is rejected: the contract carries raw bytes", async () => {
    const blockhashWithMetadata = {
      ...(await buildEnvelope({ taker })).blockhashWithMetadata,
      blockhash: "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
    };
    expect((await buildVia({ blockhashWithMetadata })).success).toBe(false);
  });

  test("a fractional lastValidBlockHeight is rejected", async () => {
    const blockhashWithMetadata = {
      ...(await buildEnvelope({ taker })).blockhashWithMetadata,
      lastValidBlockHeight: 1.5,
    };
    expect((await buildVia({ blockhashWithMetadata })).success).toBe(false);
  });

  test("instruction data that is not base64 is rejected", async () => {
    const envelope = await buildEnvelope({ taker });
    const swapInstruction = { ...envelope.swapInstruction, data: "definitely not base64!!" };
    expect((await buildVia({ swapInstruction })).success).toBe(false);
  });

  test("non-canonical base64 instruction data is rejected", async () => {
    const envelope = await buildEnvelope({ taker });
    const swapInstruction = { ...envelope.swapInstruction, data: "QQ" };
    expect((await buildVia({ swapInstruction })).success).toBe(false);
  });

  test("an account pubkey that does not decode to 32 bytes is rejected", async () => {
    const envelope = await buildEnvelope({ taker });
    const swapInstruction = {
      ...envelope.swapInstruction,
      accounts: envelope.swapInstruction.accounts.map((a, i) =>
        i === 0 ? { ...a, pubkey: "abc" } : a,
      ),
    };
    expect((await buildVia({ swapInstruction })).success).toBe(false);
  });

  test("an account pubkey longer than 32 bytes in base58 is rejected", async () => {
    const envelope = await buildEnvelope({ taker });
    const long = getBase58Decoder().decode(Uint8Array.from({ length: 33 }, () => 7));
    const swapInstruction = {
      ...envelope.swapInstruction,
      accounts: envelope.swapInstruction.accounts.map((a, i) =>
        i === 0 ? { ...a, pubkey: long } : a,
      ),
    };
    expect((await buildVia({ swapInstruction })).success).toBe(false);
  });

  test("a non-canonical inputMint address is rejected", async () => {
    expect((await buildVia({ inputMint: "0OIl-not-base58" })).success).toBe(false);
  });
});
