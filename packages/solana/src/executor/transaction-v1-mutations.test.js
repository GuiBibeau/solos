// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getAddressDecoder,
  getBase64EncodedWireTransaction,
  getTransactionMessageSize,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { V1_FIXTURE_CONFIG, rejectionReasonOf } from "./transaction-v1-fixture.js";
import {
  assertV1MessageForSigning,
  assertV1WireForSubmission,
  beginV1Message,
  signV1Message,
} from "./transaction-v1.js";

const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";

const V1_CONFIG = V1_FIXTURE_CONFIG;

const countingSigner = async () => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  const calls = { count: 0 };
  return {
    calls,
    signer: {
      address: signer.address,
      signTransactions: async (transactions) => {
        calls.count += 1;
        return signer.signTransactions(transactions);
      },
    },
  };
};

/** @param {0 | "legacy"} version @param {import("@solana/kit").TransactionPartialSigner} signer */
const oldMessage = (version, signer) =>
  setTransactionMessageFeePayerSigner(signer, createTransactionMessage({ version }));

/** @param {import("@solana/kit").TransactionPartialSigner} signer */
const v1MessageFor = (signer) =>
  appendTransactionMessageInstructions(
    [{ programAddress: "11111111111111111111111111111111", data: new Uint8Array([2]) }],
    beginV1Message({ feePayerSigner: signer, config: V1_CONFIG }),
  );

describe("transaction v1 mutation guards [integration]", () => {
  for (const version of /** @type {const} */ ([0, "legacy"])) {
    test(`refuses ${version} before invoking its signer`, async () => {
      const { signer, calls } = await countingSigner();
      await expect(signV1Message(oldMessage(version, signer))).rejects.toBeInstanceOf(
        BuildRejected,
      );
      expect(calls.count).toBe(0);
    });
  }

  test("refuses a ComputeBudget instruction before signing", async () => {
    const { signer, calls } = await countingSigner();
    const message = appendTransactionMessageInstructions(
      [{ programAddress: COMPUTE_BUDGET, data: new Uint8Array([2]) }],
      v1MessageFor(signer),
    );
    await expect(signV1Message(message)).rejects.toBeInstanceOf(BuildRejected);
    expect(calls.count).toBe(0);
  });

  test("refuses invalid local resource configuration before signing", async () => {
    const { signer, calls } = await countingSigner();
    // The reason names the clause that failed. Flattening every policy breach into one sentence
    // meant a refused build said nothing an operator could act on — a heavy route over the
    // account ceiling read exactly like a malformed config (#116).
    for (const [config, clause] of [
      [{ ...V1_CONFIG, computeUnitLimit: 0 }, "compute unit limit"],
      [{ ...V1_CONFIG, loadedAccountsDataSizeLimit: 0 }, "loaded accounts data size limit"],
      [{ ...V1_CONFIG, priorityFeeLamports: 100_001n }, "priority fee"],
    ]) {
      expect(() => beginV1Message({ feePayerSigner: signer, config })).toThrow(BuildRejected);
      try {
        beginV1Message({ feePayerSigner: signer, config });
      } catch (error) {
        expect(/** @type {BuildRejected} */ (error).reason).toContain(clause);
      }
    }
    expect(calls.count).toBe(0);
  });

  test("refuses more than 64 unique addresses and a wire over 4096 bytes", async () => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    const decoder = getAddressDecoder();
    const accounts = Array.from({ length: 64 }, (_, index) => ({
      address: decoder.decode(new Uint8Array(32).fill(index + 1)),
      role: AccountRole.READONLY,
    }));
    const crowded = appendTransactionMessageInstructions(
      [{ programAddress: "11111111111111111111111111111111", accounts }],
      v1MessageFor(signer),
    );
    expect(() => assertV1MessageForSigning(crowded)).toThrow(BuildRejected);
    const oversized = appendTransactionMessageInstructions(
      [{ programAddress: "11111111111111111111111111111111", data: new Uint8Array(4000) }],
      v1MessageFor(signer),
    );
    expect(() => assertV1MessageForSigning(oversized)).toThrow(BuildRejected);
    // The two breaches must be told apart: this is the pair that read identically before.
    // Kit stops the compile before our own count runs, but its error carries the number as
    // structured context, so the clause still says how many (#124). This is the case #116 named.
    expect(rejectionReasonOf(() => assertV1MessageForSigning(crowded))).toMatch(
      /\d+ unique accounts, over the 64 a v1 message allows/,
    );
    // The clause now carries both numbers, which is what makes the ceiling tunable rather than
    // mysterious (#124); asserting them keeps a future change from dropping them again.
    expect(rejectionReasonOf(() => assertV1MessageForSigning(oversized))).toMatch(
      /serialized size \d+ bytes, over the 4096-byte v1 ceiling/,
    );
  });

  test("accepts the exact 4096-byte boundary", async () => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    const atLimit = Array.from({ length: 300 }, (_, offset) =>
      appendTransactionMessageInstructions(
        [
          {
            programAddress: "11111111111111111111111111111111",
            data: new Uint8Array(3800 + offset),
          },
        ],
        v1MessageFor(signer),
      ),
    ).find((message) => getTransactionMessageSize(message) === 4096);
    expect(atLimit).toBeDefined();
    if (!atLimit) throw new Error("fixture did not reach the v1 size boundary");
    expect(() => assertV1MessageForSigning(atLimit)).not.toThrow();
  });

  test("refuses a signed v0 wire at the pre-RPC boundary", async () => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    const signed = await signTransactionMessageWithSigners(oldMessage(0, signer));
    const wire = getBase64EncodedWireTransaction(signed);
    expect(() => assertV1WireForSubmission(wire)).toThrow(BuildRejected);
  });
});
