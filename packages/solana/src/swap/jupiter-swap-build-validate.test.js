// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { POOL_AUTHORITY } from "./jupiter-swap-build-bodies.js";
import { AMOUNT, INPUT_MINT, OUT_AMOUNT, OUTPUT_MINT, minOutFor } from "./jupiter-swap-build-bodies.js";
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";
import { buildRejection } from "./jupiter-swap-build-accounts.js";
import { COMPUTE_BUDGET_PROGRAM, SYSTEM_PROGRAM } from "./jupiter-swap-build-validate.js";

/**
 * Pre-sign rejection of a mutated provider build: the intent echo, the minimum output, the
 * program allowlist, and the signer allowlist. Every mutation must yield `BuildRejected` with a
 * fixed reason — and because `buildRejection` runs before assembly, nothing was signed, sent,
 * or dialled to prove it.
 */

/** @type {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} */
let envelope;
/** @type {string} */
let taker;
const action = { type: "swap", inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: AMOUNT, maxSlippageBps: 50 };

beforeAll(async () => {
  const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(42));
  taker = signer.address;
  envelope = await buildEnvelope({ taker });
});

/** @param {Record<string, unknown>} overrides */
const rejectionFor = async (overrides) =>
  buildRejection({ ...envelope, ...overrides }, action, taker);

describe("build rejection before signing", () => {
  test("the documented envelope passes every check", async () => {
    expect(await buildRejection(envelope, action, taker)).toBeUndefined();
  });

  test("an echoed mint different from the request is rejected", async () => {
    expect(await rejectionFor({ outputMint: INPUT_MINT })).toContain("mints did not match");
  });

  test("an echoed inAmount different from the requested amount is rejected", async () => {
    expect(await rejectionFor({ inAmount: "999" })).toContain("inAmount did not match");
  });

  test("an echoed slippage different from the requested tolerance is rejected", async () => {
    expect(
      await rejectionFor({ slippageBps: 60, otherAmountThreshold: minOutFor(OUT_AMOUNT, 60) }),
    ).toContain("slippageBps did not match");
  });

  test("a non-ExactIn swap mode is rejected", async () => {
    expect(await rejectionFor({ swapMode: "ExactOut" })).toContain("ExactIn");
  });

  test("a missing otherAmountThreshold is rejected: the minimum output is never fabricated", async () => {
    expect(await rejectionFor({ otherAmountThreshold: undefined })).toContain(
      "no otherAmountThreshold",
    );
  });

  test("a minimum output below the exact tolerance floor is rejected", async () => {
    const low = String(BigInt(minOutFor(OUT_AMOUNT, 50)) - 1n);
    expect(await rejectionFor({ otherAmountThreshold: low })).toContain("below the exact worst case");
  });

  test("a minimum output above the quoted output is rejected", async () => {
    const high = String(BigInt(OUT_AMOUNT) + 1n);
    expect(await rejectionFor({ otherAmountThreshold: high })).toContain("exceeded the quoted output");
  });

  test("non-integer amount strings are rejected before any BigInt math", async () => {
    expect(await rejectionFor({ outAmount: "12x" })).toContain("not a positive integer");
    expect(await rejectionFor({ otherAmountThreshold: "1.5" })).toContain("base-unit integer string");
  });

  test("a swap instruction on any program but Jupiter v6 is rejected", async () => {
    const swap = { ...envelope.swapInstruction, programId: SYSTEM_PROGRAM };
    expect(await rejectionFor({ swapInstruction: swap })).toContain("Jupiter v6 aggregator");
  });

  test("a provider compute-unit limit is rejected: the limit is ours alone", async () => {
    const limit = { programId: COMPUTE_BUDGET_PROGRAM, accounts: [], data: "AgAAAAAAAAA=" };
    expect(await rejectionFor({ computeBudgetInstructions: [limit] })).toContain(
      "may only set a compute unit price",
    );
  });

  test("setup instructions outside the known set are rejected", async () => {
    const setup = { programId: POOL_AUTHORITY, accounts: [], data: "AQ==" };
    expect(await rejectionFor({ setupInstructions: [setup] })).toContain("outside the known ATA");
  });

  test("cleanup that is not a token closeAccount is rejected", async () => {
    const cleanup = { ...envelope.cleanupInstruction, data: "Ag==" };
    expect(await rejectionFor({ cleanupInstruction: cleanup })).toContain("not a token closeAccount");
  });

  test("a tip instruction is rejected: auto tips are banned", async () => {
    const tip = { programId: SYSTEM_PROGRAM, accounts: [], data: "" };
    expect(await rejectionFor({ tipInstruction: tip })).toContain("tip instruction");
  });

  test("any otherInstructions payload is rejected", async () => {
    const other = { programId: SYSTEM_PROGRAM, accounts: [], data: "" };
    expect(await rejectionFor({ otherInstructions: [other] })).toContain("otherInstructions");
  });

  test("an account outside the configured signer required to sign is rejected", async () => {
    const swap = {
      ...envelope.swapInstruction,
      accounts: [
        ...envelope.swapInstruction.accounts,
        { pubkey: POOL_AUTHORITY, isWritable: true, isSigner: true },
      ],
    };
    expect(await rejectionFor({ swapInstruction: swap })).toContain("outside the configured signer");
  });

  test("a swap that does not require the configured signer is rejected", async () => {
    const swap = {
      ...envelope.swapInstruction,
      accounts: envelope.swapInstruction.accounts.map((a) => ({ ...a, isSigner: false })),
    };
    expect(await rejectionFor({ swapInstruction: swap })).toContain("did not require the configured signer");
  });
});
