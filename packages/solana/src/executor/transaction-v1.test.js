// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  setTransactionMessageFeePayerSigner,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import {
  assertV1MessageForSigning,
  assertV1WireForSubmission,
  beginV1Message,
} from "./transaction-v1.js";

/**
 * Forced legacy/v0 mutations at both enforcement boundaries. The boundary functions take only
 * message objects and wire bytes — no signer port, no RPC port — so a refusal here proves zero
 * signatures were produced and zero network contact was made: there is nothing to sign or dial
 * with. The real swap path calls the pre-sign assert before signing and the pre-submit assert
 * before the bytes touch the transport.
 */

const v1MessageFor = async (version) => {
  const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(13));
  const base =
    version === 1
      ? beginV1Message({
          feePayerSigner: signer,
          config: { computeUnitLimit: 400_000, priorityFeeLamports: 1000n },
        })
      : setTransactionMessageFeePayerSigner(signer, createTransactionMessage({ version }));
  const instruction = {
    programAddress: "11111111111111111111111111111111",
    accounts: [{ address: signer.address, role: 3 }],
    data: new Uint8Array([2]),
  };
  return { signer, message: appendTransactionMessageInstructions([instruction], base) };
};

describe("the v1 enforcement boundary refuses legacy and v0", () => {
  test("a v1 message passes the pre-sign assert with the 0x81 version byte", async () => {
    const { message } = await v1MessageFor(1);
    const { compiled, bytes } = assertV1MessageForSigning(message);
    expect(compiled.version).toBe(1);
    expect(bytes[0]).toBe(0x81);
  });

  test("a v0 message is refused before signing: no signature is ever produced", async () => {
    const { message } = await v1MessageFor(0);
    const error = rejectionOf(() => assertV1MessageForSigning(message));
    expect(error).toBeInstanceOf(BuildRejected);
    expect(error?.reason).toContain("was not v1 before signing; nothing was signed");
  });

  test("a legacy message is refused before signing: no signature is ever produced", async () => {
    const { message } = await v1MessageFor("legacy");
    const error = rejectionOf(() => assertV1MessageForSigning(message));
    expect(error?.reason).toContain("was not v1 before signing; nothing was signed");
  });

  test("a signed v1 wire passes the pre-submit assert", async () => {
    const { message } = await v1MessageFor(1);
    const signed = await partiallySignTransactionMessageWithSigners(
      /** @type {Parameters<typeof partiallySignTransactionMessageWithSigners>[0]} */ (
        /** @type {unknown} */ (message)
      ),
    );
    const wire = getBase64EncodedWireTransaction(signed);
    const compiled = assertV1WireForSubmission(wire);
    expect(compiled.version).toBe(1);
    expect(getBase64CodecBytes(wire)[0]).toBe(0x81);
  });

  test("a signed v0 wire is refused before submission: nothing is sent", async () => {
    const { message } = await v1MessageFor(0);
    const signed = await partiallySignTransactionMessageWithSigners(
      /** @type {Parameters<typeof partiallySignTransactionMessageWithSigners>[0]} */ (
        /** @type {unknown} */ (message)
      ),
    );
    const wire = getBase64EncodedWireTransaction(signed);
    const error = rejectionOf(() => assertV1WireForSubmission(wire));
    expect(error).toBeInstanceOf(BuildRejected);
    expect(error?.reason).toContain("was not v1 before submission; nothing was sent");
  });
});

/** @param {string} base64 */
const getBase64CodecBytes = (base64) => new Uint8Array(Buffer.from(base64, "base64"));

/** @param {() => unknown} fn @returns {BuildRejected | undefined} */
const rejectionOf = (fn) => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return /** @type {BuildRejected} */ (error);
  }
};
