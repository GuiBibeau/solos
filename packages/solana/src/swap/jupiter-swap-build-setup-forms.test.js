// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { getBase64Codec } from "@solana/kit";
import { buildRejection } from "./jupiter-swap-build-accounts.js";
import { AMOUNT, INPUT_MINT, OUTPUT_MINT } from "./jupiter-swap-build-bodies.js";
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";
import {
  ATA_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
} from "./jupiter-swap-build-validate.js";

/**
 * Instruction-form refusals before signing: setup may only carry an idempotent ATA create, a
 * classic-Token SyncNative, or a plain System transfer; compute-budget instructions must be
 * well-formed prices; cleanup must be a three-account classic closeAccount. Any other token
 * discriminator — transfer, transfer-checked, approve, set-authority, mint-to, burn — or any
 * unknown one is refused by form alone, before any account is read. Nothing signs or dials.
 */

const b64 = (...bytes) => getBase64Codec().decode(Uint8Array.of(...bytes));

/** @type {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} */
let envelope;
/** @type {string} */
let taker;
const action = {
  type: "swap",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: AMOUNT,
  maxSlippageBps: 50,
};

beforeAll(async () => {
  const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(42));
  taker = signer.address;
  envelope = await buildEnvelope({ taker });
});

/** @param {Record<string, unknown>} overrides */
const rejectionFor = async (overrides) =>
  buildRejection({ ...envelope, ...overrides }, action, taker);

/** The documented setup plus one extra instruction. */
const withExtraSetup = async (ix) =>
  rejectionFor({ setupInstructions: [...envelope.setupInstructions, ix] });

describe("instruction forms before signing", () => {
  test("the documented envelope passes every form check", async () => {
    expect(await rejectionFor({})).toBeUndefined();
  });

  test("setup transfers, approves, authorities, mints, and burns are refused by form", async () => {
    for (const discriminator of [3, 4, 6, 7, 8, 12]) {
      const ix = { programId: TOKEN_PROGRAM, accounts: [], data: b64(discriminator) };
      expect(await withExtraSetup(ix)).toContain("forbidden token instruction");
    }
  });

  test("an unknown classic-token discriminator is refused by form", async () => {
    const ix = { programId: TOKEN_PROGRAM, accounts: [], data: b64(0) };
    expect(await withExtraSetup(ix)).toContain("forbidden token instruction");
  });

  test("any direct token-2022 instruction is refused", async () => {
    const ix = { programId: TOKEN_2022_PROGRAM, accounts: [], data: b64(17) };
    expect(await withExtraSetup(ix)).toContain("forbidden token-2022 instruction");
  });

  test("an unknown ATA discriminator is refused", async () => {
    const ix = { programId: ATA_PROGRAM, accounts: [], data: b64(0) };
    expect(await withExtraSetup(ix)).toContain("unknown ATA instruction");
  });

  test("an unknown System discriminator is refused", async () => {
    const ix = { programId: SYSTEM_PROGRAM, accounts: [], data: b64(1) };
    expect(await withExtraSetup(ix)).toContain("unknown System instruction");
  });

  test("a provider compute-unit limit is refused: v1 carries no budget instructions", async () => {
    const ix = {
      programId: COMPUTE_BUDGET_PROGRAM,
      accounts: [],
      data: b64(2, 0, 0, 0, 0, 0, 0, 0, 0),
    };
    expect(await rejectionFor({ computeBudgetInstructions: [ix] })).toContain(
      "well-formed compute unit price",
    );
  });

  test("a malformed compute-unit price is refused", async () => {
    const ix = { programId: COMPUTE_BUDGET_PROGRAM, accounts: [], data: b64(3) };
    expect(await rejectionFor({ computeBudgetInstructions: [ix] })).toContain(
      "well-formed compute unit price",
    );
  });

  test("cleanup that is not a three-account closeAccount is refused", async () => {
    const cleanup = {
      ...envelope.cleanupInstruction,
      accounts: envelope.cleanupInstruction.accounts.slice(1),
    };
    expect(await rejectionFor({ cleanupInstruction: cleanup })).toContain(
      "not a token closeAccount",
    );
  });
});
