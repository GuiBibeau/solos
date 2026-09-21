// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { assertV1MessageForSigning } from "../executor/transaction-v1.js";
import { assembleSwapMessage } from "./jupiter-swap-build-assemble.js";
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";

const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(7));
const LIFETIME = {
  blockhash: "11111111111111111111111111111111",
  lastValidBlockHeight: 4_294_967_296n,
};

/** First data bytes of the assembled message: the two leading ATA creates' opcodes. */
/** @param {Awaited<ReturnType<typeof buildEnvelope>>} envelope */
const createOpcodes = async (envelope) => {
  const { compiled } = assertV1MessageForSigning(
    await assembleSwapMessage(envelope, signer, LIFETIME),
  );
  return compiled.instructionPayloads
    .slice(0, 2)
    .map((payload) => /** @type {Record<string, number>} */ (payload.instructionData)?.["0"]);
};

describe("temp wSOL create pinning at assembly", () => {
  test("a cleanup-owned build pins the temp create to exclusive creation", async () => {
    const envelope = await buildEnvelope({ taker: signer.address });
    expect(await createOpcodes(envelope)).toEqual([1, 0]);
  });

  test("a build without cleanup keeps idempotent creates for durable wSOL accounts", async () => {
    const envelope = await buildEnvelope({ taker: signer.address });
    const durable = { ...envelope, cleanupInstruction: null };
    expect(await createOpcodes(durable)).toEqual([1, 1]);
  });
});
