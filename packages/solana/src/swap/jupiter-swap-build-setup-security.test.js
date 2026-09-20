// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { getBase64Codec, getU64Codec } from "@solana/kit";
import { buildRejection } from "./jupiter-swap-build-accounts.js";
import { AMOUNT, INPUT_MINT, OUTPUT_MINT, POOL_AUTHORITY } from "./jupiter-swap-build-bodies.js";
import { buildEnvelope, fixtureAtas } from "./jupiter-swap-build-fixture.js";
import {
  ATA_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
} from "./jupiter-swap-build-validate.js";

/**
 * Ownership bindings before signing: the ATA create is paid and owned by the taker and derives
 * the account under the token program its own instruction names for one of the requested mints;
 * the wSOL wrap funds the taker's derived temporary account with exactly the requested amount;
 * cleanup closes only that temporary account back to the taker. A build paying, owning, or
 * crediting anyone else is refused before signing — nothing reaches the chain.
 */

const meta = (pubkey, isWritable, isSigner) => ({ pubkey, isWritable, isSigner });
const b64 = (...bytes) => getBase64Codec().decode(Uint8Array.of(...bytes));

/** @type {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} */
let envelope;
/** @type {string} */
let taker;
/** @type {{ sourceAta: string; destinationAta: string }} */
let atas;
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
  atas = await fixtureAtas(taker);
  envelope = await buildEnvelope({ taker });
});

/** @param {Record<string, unknown>} overrides */
const rejectionFor = async (overrides) =>
  buildRejection({ ...envelope, ...overrides }, action, taker);

/** The one ATA-create instruction of the documented setup, with account `index` rewritten. */
const withCreatedAccount = async (index, account) => {
  const create = envelope.setupInstructions.find((ix) => ix.programId === ATA_PROGRAM);
  const attacked = {
    ...create,
    accounts: create.accounts.map((a, i) => (i === index ? account : a)),
  };
  return rejectionFor({ setupInstructions: [attacked] });
};

describe("setup and cleanup ownership bindings before signing", () => {
  test("the documented envelope passes every binding check", async () => {
    expect(await rejectionFor({})).toBeUndefined();
  });

  test("an ATA create paid by an attacker is rejected", async () => {
    expect(await withCreatedAccount(0, meta(POOL_AUTHORITY, true, false))).toContain(
      "payer was not the taker",
    );
  });

  test("an ATA create owned by an attacker is rejected", async () => {
    expect(await withCreatedAccount(2, meta(POOL_AUTHORITY, false, false))).toContain(
      "owner was not the taker",
    );
  });

  test("an ATA create for an unrequested mint is rejected", async () => {
    expect(await withCreatedAccount(3, meta(POOL_AUTHORITY, false, false))).toContain(
      "not one of the requested swap mints",
    );
  });

  test("an ATA create under the wrong token program is rejected", async () => {
    expect(await withCreatedAccount(5, meta(TOKEN_2022_PROGRAM, false, false))).toContain(
      "did not target the taker's derived associated token account",
    );
  });

  test("a wSOL funding transfer of the wrong amount is rejected", async () => {
    const wrong = {
      programId: SYSTEM_PROGRAM,
      accounts: [meta(taker, true, true), meta(atas.sourceAta, true, false)],
      data: b64(2, ...getU64Codec().encode(BigInt(AMOUNT) + 1n)),
    };
    const setup = envelope.setupInstructions.map((ix) =>
      ix.programId === SYSTEM_PROGRAM ? wrong : ix,
    );
    expect(await rejectionFor({ setupInstructions: setup })).toContain(
      "did not carry the exact requested input amount",
    );
  });

  test("a SyncNative without the exact transfer behind it is rejected", async () => {
    const sync = {
      programId: TOKEN_PROGRAM,
      accounts: [meta(atas.sourceAta, true, false)],
      data: b64(17),
    };
    expect(await rejectionFor({ setupInstructions: [sync] })).toContain(
      "outside the documented wSOL wrap",
    );
  });

  test("a SyncNative on a foreign account is rejected", async () => {
    const setup = envelope.setupInstructions.map((ix) =>
      ix.accounts.length === 1 ? { ...ix, accounts: [meta(atas.destinationAta, true, false)] } : ix,
    );
    expect(await rejectionFor({ setupInstructions: setup })).toContain("temporary wSOL account");
  });

  test("a wSOL funding transfer with no SyncNative behind it is rejected", async () => {
    const setup = envelope.setupInstructions.filter((ix) => ix.accounts.length !== 1);
    expect(await rejectionFor({ setupInstructions: setup })).toContain("no SyncNative behind it");
  });

  test("a duplicate wSOL funding transfer is rejected", async () => {
    const [create, transfer, sync] = envelope.setupInstructions;
    expect(await rejectionFor({ setupInstructions: [create, transfer, transfer, sync] })).toContain(
      "more than one wSOL funding transfer",
    );
  });

  test("a duplicate SyncNative is rejected", async () => {
    const [create, transfer, sync] = envelope.setupInstructions;
    expect(await rejectionFor({ setupInstructions: [create, transfer, sync, sync] })).toContain(
      "more than one SyncNative",
    );
  });

  test("a SyncNative preceding its funding transfer is rejected", async () => {
    const [create, transfer, sync] = envelope.setupInstructions;
    expect(await rejectionFor({ setupInstructions: [create, sync, transfer] })).toContain(
      "did not follow the wSOL funding transfer",
    );
  });

  test("wrap instructions for a non-wSOL input are rejected", async () => {
    const inverted = { inputMint: OUTPUT_MINT, outputMint: INPUT_MINT };
    expect(
      await buildRejection({ ...envelope, ...inverted }, { ...action, ...inverted }, taker),
    ).toContain("moved native SOL without a wSOL input");
  });
});
