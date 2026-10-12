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
import {
  SWAP_COMPUTE_UNIT_LIMIT,
  SWAP_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
  SWAP_MAX_PRIORITY_FEE_LAMPORTS,
  SWAP_V1_CONFIG,
  swapDraft,
  swapPriorityFeeLamports,
} from "./jupiter-swap-build-assemble.js";
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";
import { swapFeeReserveLamports } from "./swap-fee.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BLOCKHASH = /** @type {import("@solana/kit").Blockhash} */ (
  "11111111111111111111111111111111"
);
const PRICE = "100";
const MICRO_LAMPORTS_PER_LAMPORT = 1_000_000n;

/** @param {Awaited<ReturnType<typeof createMemorySignerFromBytes>>} signer */
const builtSwap = async (signer) => {
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
  return { draft, compiled, priority, paid };
};

/** Priority fee the built message pays: ceil(compute-unit price × limit / 1_000_000). */
const priorityFromPrice = () => {
  const micro = SWAP_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS * BigInt(SWAP_COMPUTE_UNIT_LIMIT);
  return (micro + MICRO_LAMPORTS_PER_LAMPORT - 1n) / MICRO_LAMPORTS_PER_LAMPORT;
};

describe("swap fee reserve", () => {
  test("the built swap fee is the compute-unit price times its limit", async () => {
    const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(7));
    const { draft, compiled, priority, paid } = await builtSwap(signer);
    const fromPrice = priorityFromPrice();
    expect(draft.config).toBe(SWAP_V1_CONFIG);
    expect(compiled.header.numSignerAccounts).toBe(1);
    expect(priority).toBe(fromPrice);
    expect(swapPriorityFeeLamports()).toBe(fromPrice);
    expect(fromPrice).toBe(SWAP_MAX_PRIORITY_FEE_LAMPORTS);
    expect(swapFeeReserveLamports()).toBe(TRANSFER_BASE_FEE_LAMPORTS + fromPrice);
    expect(paid <= swapFeeReserveLamports()).toBe(true);
  });

  test("a built swap cannot cost more than its hold", async () => {
    const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(7));
    const { paid } = await builtSwap(signer);
    const action = {
      type: /** @type {const} */ ("swap"),
      inputMint: WSOL_MINT,
      outputMint: USDC,
      amount: "10000000",
      maxSlippageBps: 50,
    };
    const feeUsd = usdForLamports(swapFeeReserveLamports().toString(), PRICE) ?? "0";
    const paidUsd = usdForLamports(paid.toString(), PRICE) ?? "0";
    const priced = { priceUsd: PRICE, decimals: 9, feeUsd };
    const hold = reserveUsdFor(action, priced);
    const input = actualUsdFor(action, priced);
    expect(compareDecimal(addDecimal(input, paidUsd), hold) <= 0).toBe(true);
  });
});
