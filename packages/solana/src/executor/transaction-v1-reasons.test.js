// @ts-check
/**
 * What a v1 policy refusal tells the operator.
 *
 * #117 made each refusal name its clause. What it did not do is say what was observed against
 * what was allowed, and it left one path — an error inside the boundary that is not one of our
 * clauses — falling back to the bare sentence. That bare sentence was measured at roughly 1% of
 * swap attempts in #116 and its cause is still unknown, precisely because it names nothing.
 *
 * So these assert the two numbers, and that no refusal can come back anonymous.
 */
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { createTransactionMessage, setTransactionMessageFeePayerSigner } from "@solana/kit";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { V1_FIXTURE_CONFIG, rejectionReasonOf } from "./transaction-v1-fixture.js";
import {
  MAX_PRIORITY_FEE_LAMPORTS,
  V1_UNKNOWN_CLAUSE,
  assertV1MessageForSigning,
  assertV1WireForSubmission,
  beginV1Message,
} from "./transaction-v1.js";

const signerFor = async () => await createMemorySignerFromBytes(randomSeed());

describe("v1 policy refusals name what was observed and what was allowed [integration]", () => {
  test("a compute unit limit of zero reports the value it saw", async () => {
    const signer = await signerFor();
    const reason = rejectionReasonOf(() =>
      beginV1Message({
        feePayerSigner: signer,
        config: { ...V1_FIXTURE_CONFIG, computeUnitLimit: 0 },
      }),
    );
    expect(reason).toContain("compute unit limit");
    expect(reason).toContain("0");
  });

  test("a priority fee over the ceiling reports both the fee and the ceiling", async () => {
    const signer = await signerFor();
    const over = MAX_PRIORITY_FEE_LAMPORTS + 1n;
    const reason = rejectionReasonOf(() =>
      beginV1Message({
        feePayerSigner: signer,
        config: { ...V1_FIXTURE_CONFIG, priorityFeeLamports: over },
      }),
    );
    expect(reason).toContain(String(over));
    expect(reason).toContain(String(MAX_PRIORITY_FEE_LAMPORTS));
  });

  test("an absent loaded-accounts bound is named, not silently defaulted", async () => {
    const signer = await signerFor();
    const reason = rejectionReasonOf(() =>
      beginV1Message({
        feePayerSigner: signer,
        config: { ...V1_FIXTURE_CONFIG, loadedAccountsDataSizeLimit: undefined },
      }),
    );
    expect(reason).toContain("loaded accounts data size limit");
  });

  // The path that produced the anonymous failures in #116: something inside the boundary throws
  // that is not one of our clauses. It must still be attributable, and it must not carry the
  // library's own words — #117 established that only our fixed vocabulary travels.
  test("an unexpected error inside the boundary is named, never anonymous", () => {
    const reason = rejectionReasonOf(() => assertV1WireForSubmission("not base64 at all !!!"));
    expect(reason).toContain(V1_UNKNOWN_CLAUSE);
    expect(reason).not.toBe("transaction failed v1 policy before RPC; nothing was sent");
  });

  test("no refusal is the bare sentence with no clause attached", async () => {
    const signer = await signerFor();
    const reasons = [
      rejectionReasonOf(() => beginV1Message({ feePayerSigner: signer, config: {} })),
      rejectionReasonOf(() => assertV1WireForSubmission("not base64 at all !!!")),
      rejectionReasonOf(() =>
        assertV1MessageForSigning(
          /** @type {any} */ (
            setTransactionMessageFeePayerSigner(signer, createTransactionMessage({ version: 0 }))
          ),
        ),
      ),
    ];
    for (const reason of reasons) {
      expect(reason).toMatch(/\(.+\)$/);
      expect(reason).not.toBe("transaction failed v1 policy before signing; nothing was signed");
      expect(reason).not.toBe("transaction failed v1 policy before RPC; nothing was sent");
    }
  });

  test("a library's own error text never reaches the caller", () => {
    // An exact match proves the point better than scanning for known words: the whole reason is
    // composed of solOS's two fixed strings, so nothing the codec said about itself got in.
    expect(rejectionReasonOf(() => assertV1WireForSubmission("not base64 at all !!!"))).toBe(
      `transaction failed v1 policy before RPC; nothing was sent (${V1_UNKNOWN_CLAUSE})`,
    );
  });
});
