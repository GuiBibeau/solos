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
import {
  actualUsdFor,
  addDecimal,
  compareDecimal,
  reserveUsdFor,
  usdForLamports,
} from "@solos/core/strategy";
import { WSOL_MINT } from "@solos-sh/actions";
import { beginV1Message } from "../executor/transaction-v1.js";
import { SWAP_V1_CONFIG, swapDraft } from "./jupiter-swap-build-assemble.js";
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";
import { swapFeeReserveLamports } from "./swap-fee.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BLOCKHASH = /** @type {import("@solana/kit").Blockhash} */ (
  "11111111111111111111111111111111"
);
const PRICE = "100";

describe("swap fee reserve", () => {
  test("the built transaction fee cannot exceed the fee inside the hold", async () => {
    const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(7));
    const envelope = await buildEnvelope({ taker: signer.address });
    const draft = await swapDraft(envelope, signer);
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
    const action = {
      type: /** @type {const} */ ("swap"),
      inputMint: WSOL_MINT,
      outputMint: USDC,
      amount: "10000000",
      maxSlippageBps: 50,
    };
    const reserved = swapFeeReserveLamports();
    const feeUsd = usdForLamports(reserved.toString(), PRICE) ?? "0";
    const paidUsd = usdForLamports(paid.toString(), PRICE) ?? "0";
    const hold = reserveUsdFor(action, PRICE, feeUsd);
    const input = actualUsdFor(action, PRICE);
    expect(draft.config).toBe(SWAP_V1_CONFIG);
    expect(compiled.header.numSignerAccounts).toBe(1);
    expect(priority).toBe(SWAP_V1_CONFIG.priorityFeeLamports);
    expect(reserved).toBe(105_000n);
    expect(paid <= reserved).toBe(true);
    expect(compareDecimal(addDecimal(input, paidUsd), hold) <= 0).toBe(true);
  });
});
