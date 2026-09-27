// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  address,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { seal } from "../submission/sealed.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";

/**
 * Submission builds every message it signs as v1 (ADR-0032), so a legacy or v0 transaction can
 * only reach it through a bug. The wire check that ends sealing is the last line: whatever bytes
 * come out of signing must decode to v1, or nothing leaves sealing for simulation or delivery.
 */

/** @param {0 | "legacy"} version */
const signedOld = async (version) => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  const message = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: address("11111111111111111111111111111111"), lastValidBlockHeight: 1n },
    setTransactionMessageFeePayerSigner(signer, createTransactionMessage({ version })),
  );
  return signTransactionMessageWithSigners(message);
};

describe("transaction v1 RPC boundary [integration]", () => {
  test("legacy and v0 wires are refused where sealing ends, before any RPC", async () => {
    for (const version of /** @type {const} */ (["legacy", 0])) {
      const signed = await signedOld(version);
      const error = await failureOf(seal(/** @type {any} */ (signed)));
      expect(error).toBeInstanceOf(BuildRejected);
    }
  });
});
