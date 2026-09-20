// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  decompileTransactionMessage,
  getU64Codec,
} from "@solana/kit";
import { Effect } from "effect";
import { buildSignedSwap } from "../executor/swap-sol.js";
import {
  SWAP_COMPUTE_UNIT_LIMIT,
  SWAP_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
  SWAP_MAX_PRIORITY_FEE_LAMPORTS,
} from "./jupiter-swap-build-assemble.js";
import {
  AMOUNT,
  BLOCKHASH_BYTES,
  INPUT_MINT,
  INPUT_VAULT,
  LAST_VALID_BLOCK_HEIGHT,
  OUT_AMOUNT,
  OUTPUT_MINT,
  OUTPUT_VAULT,
  POOL_AUTHORITY,
  QUOTED_OUT_AMOUNT,
  minOutFor,
} from "./jupiter-swap-build-bodies.js";
import { buildEnvelope, fixtureAtas } from "./jupiter-swap-build-fixture.js";
import {
  ATA_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  JUP6_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
} from "./jupiter-swap-build-validate.js";

/**
 * Wire-level proof for the swap path: the real branch assembles and signs one message, and the
 * exact wire bytes decode to a v1 message (0x81 prefix) with explicit local compute policy, no
 * lookup tables, no compute-budget instructions, the documented instruction order, the taker as
 * the single required signer, the provider's blockhash lifetime, and the intended accounts,
 * amounts, and minimum output restored by decompilation.
 */

const action = {
  type: "swap",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: AMOUNT,
  maxSlippageBps: 50,
};

const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(11));
const taker = signer.address;
const atas = await fixtureAtas(taker);

const swap = await Effect.runPromise(
  buildSignedSwap(
    { kit: { signer }, build: { build: () => Effect.promise(() => buildEnvelope({ taker })) } },
    action,
  ),
);

const wireBytes = new Uint8Array(
  Buffer.from(getBase64EncodedWireTransaction(swap.signed), "base64"),
);
const transaction = getTransactionDecoder().decode(wireBytes);
const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
const decompiled = decompileTransactionMessage(
  /** @type {Parameters<typeof decompileTransactionMessage>[0]} */ (
    /** @type {unknown} */ (compiled)
  ),
  { lastValidBlockHeight: BigInt(LAST_VALID_BLOCK_HEIGHT) },
);

describe("the assembled swap wire", () => {
  test("is version 1 with no lookup tables", () => {
    expect(wireBytes[0]).toBe(0x81);
    expect(compiled.version).toBe(1);
    expect("addressTableLookups" in compiled).toBe(false);
  });

  test("carries the explicit local compute policy and no budget instructions", () => {
    expect(decompiled.config).toEqual({
      computeUnitLimit: SWAP_COMPUTE_UNIT_LIMIT,
      loadedAccountsDataSizeLimit: SWAP_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
      priorityFeeLamports: SWAP_MAX_PRIORITY_FEE_LAMPORTS,
    });
    expect(compiled.staticAccounts).not.toContain(COMPUTE_BUDGET_PROGRAM);
    // Pinned to the verified literal, not just the imported constant: the assembled wire must
    // carry the 16 MiB bound the real Metis route simulation required.
    expect(decompiled.config?.loadedAccountsDataSizeLimit).toBe(16_777_216);
  });

  test("orders setup, swap, cleanup after stripping the provider price instruction", () => {
    const programs = decompiled.instructions.map((ix) => ix.programAddress);
    expect(programs).toEqual([ATA_PROGRAM, SYSTEM_PROGRAM, JUP6_PROGRAM, TOKEN_PROGRAM]);
  });

  test("signs once, for the taker alone, as fee payer", () => {
    expect(Object.keys(transaction.signatures)).toHaveLength(1);
    expect(compiled.header.numSignerAccounts).toBe(1);
    expect(compiled.staticAccounts[0]).toBe(taker);
  });

  test("carries the intended accounts, amounts, and minimum output inline", () => {
    const transfer = decompiled.instructions[1];
    const route = decompiled.instructions[2];
    expect(getU64Codec().decode(transfer.data, 1)).toBe(BigInt(AMOUNT));
    expect(getU64Codec().decode(route.data, 12)).toBe(BigInt(AMOUNT));
    expect(getU64Codec().decode(route.data, 20)).toBe(BigInt(QUOTED_OUT_AMOUNT));
    expect(route.accounts.map((a) => a.address)).toContain(atas.destinationAta);
    expect(compiled.staticAccounts).toEqual(
      expect.arrayContaining([POOL_AUTHORITY, INPUT_VAULT, OUTPUT_VAULT]),
    );
    expect(swap.envelope.otherAmountThreshold).toBe(minOutFor(OUT_AMOUNT, 50));
  });

  test("keeps the provider's blockhash lifetime for simulation and submission", () => {
    expect(decompiled.lifetimeConstraint.blockhash).toBe(
      getBase58Decoder().decode(BLOCKHASH_BYTES),
    );
    expect(decompiled.lifetimeConstraint.lastValidBlockHeight).toBe(
      BigInt(LAST_VALID_BLOCK_HEIGHT),
    );
  });
});
