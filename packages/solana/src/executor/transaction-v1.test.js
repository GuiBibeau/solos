// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  appendTransactionMessageInstructions,
  decompileTransactionMessage,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getTransactionMessageSize,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { randomSeed } from "../surfnet/test-surfnet.js";
import {
  assertV1MessageForSigning,
  assertV1WireForSubmission,
  beginV1Message,
  signV1Message,
} from "./transaction-v1.js";

const V1_CONFIG = Object.freeze({
  computeUnitLimit: 10_000,
  loadedAccountsDataSizeLimit: 65_536,
  priorityFeeLamports: 1000n,
});

/** @param {import("@solana/kit").TransactionPartialSigner} signer */
const v1MessageFor = (signer) =>
  appendTransactionMessageInstructions(
    [{ programAddress: "11111111111111111111111111111111", data: new Uint8Array([2]) }],
    beginV1Message({ feePayerSigner: signer, config: V1_CONFIG }),
  );

describe("transaction v1 policy [integration]", () => {
  test("encodes v1, explicit resources, inline accounts and the 0x81 message prefix", async () => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    const message = v1MessageFor(signer);
    const { compiled, bytes } = assertV1MessageForSigning(message);
    expect(compiled.version).toBe(1);
    expect(bytes[0]).toBe(0x81);
    expect("addressTableLookups" in compiled).toBe(false);
    const decoded = decompileTransactionMessage(compiled);
    expect(decoded.config).toEqual(V1_CONFIG);
    expect(decoded.instructions.some((ix) => ix.programAddress.startsWith("ComputeBudget"))).toBe(
      false,
    );
  });

  test("the final signed wire decodes as the same policy-configured v1 message", async () => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    const signed = await signV1Message(v1MessageFor(signer));
    const wire = getBase64EncodedWireTransaction(signed);
    const decoded = getTransactionDecoder().decode(Buffer.from(wire, "base64"));
    expect(decoded.messageBytes[0]).toBe(0x81);
    const compiled = assertV1WireForSubmission(wire);
    expect(getCompiledTransactionMessageDecoder().decode(decoded.messageBytes)).toEqual(compiled);
    expect(decompileTransactionMessage(compiled).config).toEqual(V1_CONFIG);
  });

  test("refuses zero resource limits and priority fees over the local cap", async () => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    for (const config of [
      { ...V1_CONFIG, computeUnitLimit: 0 },
      { ...V1_CONFIG, loadedAccountsDataSizeLimit: 0 },
      { ...V1_CONFIG, priorityFeeLamports: 100_001n },
    ]) {
      expect(() => beginV1Message({ feePayerSigner: signer, config })).toThrow(BuildRejected);
    }
  });

  test("accepts a v1 transaction at the exact 4096-byte limit", async () => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    const atLimit = Array.from({ length: 300 }, (_, offset) =>
      appendTransactionMessageInstructions(
        [
          {
            programAddress: "11111111111111111111111111111111",
            data: new Uint8Array(3800 + offset),
          },
        ],
        beginV1Message({ feePayerSigner: signer, config: V1_CONFIG }),
      ),
    ).find((message) => getTransactionMessageSize(message) === 4096);
    expect(atLimit).toBeDefined();
    if (!atLimit) throw new Error("fixture did not reach the v1 size boundary");
    expect(() => assertV1MessageForSigning(atLimit)).not.toThrow();
  });
});
