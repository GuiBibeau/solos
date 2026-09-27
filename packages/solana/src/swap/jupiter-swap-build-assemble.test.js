// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { SWAP_V1_CONFIG, swapDraft } from "./jupiter-swap-build-assemble.js";
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";

const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(7));

/** First data bytes of the draft: the two leading ATA creates' opcodes. */
/** @param {Awaited<ReturnType<typeof buildEnvelope>>} envelope
 * @param {{ tempWsolExisted?: boolean }} [options] */
const createOpcodes = async (envelope, options) => {
  const draft = await swapDraft(envelope, signer, options);
  return draft.instructions.slice(0, 2).map((ix) => ix.data?.[0]);
};

describe("temp wSOL create pinning at assembly", () => {
  test("a cleanup-owned build pins the temp create to exclusive creation", async () => {
    const envelope = await buildEnvelope({ taker: signer.address });
    expect(await createOpcodes(envelope)).toEqual([1, 0]);
  });

  test("an existing empty temp account keeps the idempotent create", async () => {
    // #138: the account pre-exists empty, so an exclusive create would fail on it.
    const envelope = await buildEnvelope({ taker: signer.address });
    expect(await createOpcodes(envelope, { tempWsolExisted: true })).toEqual([1, 1]);
  });

  test("a build without cleanup keeps idempotent creates for durable wSOL accounts", async () => {
    const envelope = await buildEnvelope({ taker: signer.address });
    const durable = { ...envelope, cleanupInstruction: null };
    expect(await createOpcodes(durable)).toEqual([1, 1]);
  });
});

describe("the swap draft Submission seals", () => {
  test("setup, swap, cleanup in order, under the local resource config", async () => {
    const envelope = await buildEnvelope({ taker: signer.address });
    const draft = await swapDraft(envelope, signer);
    const programs = draft.instructions.map((ix) => ix.programAddress);
    expect(programs).toEqual(
      [
        ...envelope.setupInstructions,
        envelope.swapInstruction,
        /** @type {NonNullable<typeof envelope.cleanupInstruction>} */ (
          envelope.cleanupInstruction
        ),
      ].map((ix) => ix.programId),
    );
    expect(draft.config).toBe(SWAP_V1_CONFIG);
  });

  test("the taker's signer metas carry the keychain signer, so sealing signs them", async () => {
    const envelope = await buildEnvelope({ taker: signer.address });
    const draft = await swapDraft(envelope, signer);
    const takerMetas = draft.instructions
      .flatMap((ix) => ix.accounts ?? [])
      .filter((meta) => meta.address === signer.address && "signer" in meta && meta.signer);
    expect(takerMetas.length).toBeGreaterThan(0);
    for (const meta of takerMetas) expect(/** @type {any} */ (meta).signer).toBe(signer);
  });
});
