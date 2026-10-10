// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  appendTransactionMessageInstructions,
  compileTransactionMessage,
  decompileTransactionMessage,
  pipe,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { TRANSFER_BASE_FEE_LAMPORTS } from "@solos/core";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { beginV1Message } from "./transaction-v1.js";
import {
  TRANSFER_COMPUTE_UNIT_LIMIT,
  TRANSFER_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
  transferFeeReserveLamports,
  transferPriorityFeeLamports,
} from "./transfer-fee.js";
import { TRANSFER_V1_CONFIG, transferDraft } from "./transfer-sol.js";

const BLOCKHASH = /** @type {import("@solana/kit").Blockhash} */ (
  "11111111111111111111111111111111"
);
const MICRO_LAMPORTS_PER_LAMPORT = 1_000_000n;

describe("transfer fee reserve", () => {
  test("the built transaction fee cannot exceed the reserved fee", async () => {
    const signer = await createMemorySignerFromBytes(randomSeed());
    const draft = transferDraft(
      /** @type {import("../signer/kit-signer.js").KitSignerShape} */ ({ signer }),
      { type: "transfer_sol", to: signer.address, lamports: "1" },
    );
    const message = pipe(
      beginV1Message({ feePayerSigner: signer, config: draft.config }),
      (current) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: BLOCKHASH, lastValidBlockHeight: 1n },
          current,
        ),
      (current) => appendTransactionMessageInstructions([...draft.instructions], current),
    );
    const compiled = compileTransactionMessage(message);
    const decoded = decompileTransactionMessage(compiled);
    const priority = BigInt(decoded.config?.priorityFeeLamports ?? 0);
    const paid = TRANSFER_BASE_FEE_LAMPORTS * BigInt(compiled.header.numSignerAccounts) + priority;
    const micro = TRANSFER_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS * BigInt(TRANSFER_COMPUTE_UNIT_LIMIT);
    const priorityFromPrice =
      (micro + MICRO_LAMPORTS_PER_LAMPORT - 1n) / MICRO_LAMPORTS_PER_LAMPORT;
    expect(draft.config).toBe(TRANSFER_V1_CONFIG);
    expect(priority).toBe(transferPriorityFeeLamports());
    expect(transferPriorityFeeLamports()).toBe(priorityFromPrice);
    expect(transferFeeReserveLamports()).toBe(TRANSFER_BASE_FEE_LAMPORTS + priorityFromPrice);
    expect(paid <= transferFeeReserveLamports()).toBe(true);
  });
});
