// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { buildRejection } from "./jupiter-swap-build-accounts.js";
import { AMOUNT, INPUT_MINT, OUTPUT_MINT } from "./jupiter-swap-build-bodies.js";
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";

/**
 * Taker repeats in route hop accounts (ADR-0023). Compilation coalesces per-instruction
 * duplicates by unioning privileges, so a second occurrence of the taker is safe exactly when
 * it is a pure data reference: read-only repeats grant nothing the validated authority slot did
 * not, while a writable or signer repeat anywhere would hand the route authority over the
 * wallet beyond what validation approved.
 */

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
  const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(7));
  taker = signer.address;
  envelope = await buildEnvelope({ taker });
});

/** The fixture swap instruction with one extra route-hop account appended after the fixed prefix. */
const swapWithTailAccount = (/** @type {{isWritable: boolean, isSigner: boolean}} */ extra) => ({
  ...envelope.swapInstruction,
  accounts: [...envelope.swapInstruction.accounts, { pubkey: taker, ...extra }],
});

describe("taker repeats in route hop accounts", () => {
  test("a hop may reference the taker as a read-only account", async () => {
    const rejection = await buildRejection(
      { ...envelope, swapInstruction: swapWithTailAccount({ isWritable: false, isSigner: false }) },
      action,
      taker,
    );
    expect(rejection).toBeUndefined();
  });

  test("a hop may not take the taker writable", async () => {
    const rejection = await buildRejection(
      { ...envelope, swapInstruction: swapWithTailAccount({ isWritable: true, isSigner: false }) },
      action,
      taker,
    );
    expect(rejection).toContain("repeated the taker");
  });

  test("a hop may not take the taker as an extra signer", async () => {
    const rejection = await buildRejection(
      { ...envelope, swapInstruction: swapWithTailAccount({ isWritable: false, isSigner: true }) },
      action,
      taker,
    );
    expect(rejection).toBeTruthy();
  });
});
