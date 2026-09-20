// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getAddressDecoder,
  getBase64EncodedWireTransaction,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { randomSeed } from "../surfnet/test-surfnet.js";
import {
  assertV1MessageForSigning,
  assertV1WireForSubmission,
  beginV1Message,
  signV1Message,
} from "./transaction-v1.js";

const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const V1_CONFIG = {
  computeUnitLimit: 10_000,
  loadedAccountsDataSizeLimit: 65_536,
  priorityFeeLamports: 1000n,
};

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

describe("transaction v1 mutation guards", () => {
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
  });

  test("refuses a signed v0 wire at the pre-RPC boundary", async () => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    const signed = await signTransactionMessageWithSigners(oldMessage(0, signer));
    const wire = getBase64EncodedWireTransaction(signed);
    expect(() => assertV1WireForSubmission(wire)).toThrow(BuildRejected);
  });
});
