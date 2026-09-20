// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  AMOUNT,
  INPUT_MINT,
  INPUT_VAULT,
  OUTPUT_MINT,
  OUTPUT_VAULT,
  POOL_AUTHORITY,
} from "./jupiter-swap-build-bodies.js";
import { buildEnvelope, fixtureAtas } from "./jupiter-swap-build-fixture.js";
import { buildRejection } from "./jupiter-swap-build-accounts.js";

/**
 * Recipient and market-account rejection: the swap must move the taker's own derived token
 * accounts (source sells, destination credits), must carry the requested mints' market accounts,
 * and a setup SOL transfer may only fund the taker's own wSOL account. A build paying anyone
 * else is refused before signing — nothing reaches the chain.
 */

/** @type {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} */
let envelope;
/** @type {string} */
let taker;
/** @type {{ sourceAta: string; destinationAta: string }} */
let atas;
const action = { type: "swap", inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: AMOUNT, maxSlippageBps: 50 };

beforeAll(async () => {
  const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(42));
  taker = signer.address;
  atas = await fixtureAtas(taker);
  envelope = await buildEnvelope({ taker });
});

/** @param {Record<string, unknown>} overrides */
const rejectionFor = async (overrides) => buildRejection({ ...envelope, ...overrides }, action, taker);

/** Rewrite one swap-instruction account by role-matched position in the fixture layout. */
const withSwapAccounts = (rewrite) => ({
  ...envelope.swapInstruction,
  accounts: envelope.swapInstruction.accounts.map(rewrite),
});

describe("recipient and market-account rejection before signing", () => {
  test("the documented envelope passes every account check", async () => {
    expect(await buildRejection(envelope, action, taker)).toBeUndefined();
  });

  test("a swap that spends a foreign source token account is rejected", async () => {
    const swap = withSwapAccounts((a) =>
      a.pubkey === atas.sourceAta ? { ...a, pubkey: INPUT_VAULT } : a,
    );
    expect(await rejectionFor({ swapInstruction: swap })).toContain(
      "did not spend the taker's source token account",
    );
  });

  test("a swap that credits a foreign destination token account is rejected", async () => {
    const swap = withSwapAccounts((a) =>
      a.pubkey === atas.destinationAta ? { ...a, pubkey: INPUT_VAULT } : a,
    );
    expect(await rejectionFor({ swapInstruction: swap })).toContain(
      "did not credit the taker's destination token account",
    );
  });

  test("a swap without the input mint's market account is rejected", async () => {
    const swap = withSwapAccounts((a) => (a.pubkey === INPUT_MINT ? { ...a, pubkey: INPUT_VAULT } : a));
    expect(await rejectionFor({ swapInstruction: swap })).toContain("input mint's market account");
  });

  test("a swap without the output mint's market account is rejected", async () => {
    const swap = withSwapAccounts((a) =>
      a.pubkey === OUTPUT_MINT ? { ...a, pubkey: OUTPUT_VAULT } : a,
    );
    expect(await rejectionFor({ swapInstruction: swap })).toContain("output mint's market account");
  });

  test("setup SOL that funds a foreign account is rejected", async () => {
    const setup = envelope.setupInstructions.map((ix) =>
      ix.programId === "11111111111111111111111111111111"
        ? { ...ix, accounts: [ix.accounts[0], { ...ix.accounts[1], pubkey: POOL_AUTHORITY }] }
        : ix,
    );
    expect(await rejectionFor({ setupInstructions: setup })).toContain(
      "did not fund the taker's own wSOL account",
    );
  });

  test("setup SOL funding the taker's own wSOL account stays allowed", async () => {
    const funding = envelope.setupInstructions.filter(
      (ix) => ix.programId === "11111111111111111111111111111111",
    );
    expect(funding).toHaveLength(1);
    expect(funding[0].accounts[1].pubkey).toBe(atas.sourceAta);
    expect(await rejectionFor({})).toBeUndefined();
  });

  test("cleanup closes the taker's own source account back to the taker", async () => {
    expect(envelope.cleanupInstruction.accounts[0].pubkey).toBe(atas.sourceAta);
    expect(envelope.cleanupInstruction.accounts[1].pubkey).toBe(taker);
    expect(await rejectionFor({})).toBeUndefined();
  });
});
