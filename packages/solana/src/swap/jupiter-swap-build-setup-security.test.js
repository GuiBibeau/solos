// @ts-check
import { describe, expect, test } from "bun:test";
import { POOL_AUTHORITY } from "./jupiter-swap-build-bodies.js";
import { cleanupBindingRejection } from "./jupiter-swap-build-setup-account.js";
import {
  b64,
  createSetupSecurityDriver,
  meta,
} from "./jupiter-swap-build-setup-security-driver.js";
import { ATA_PROGRAM, TOKEN_2022_PROGRAM, WSOL_MINT } from "./jupiter-swap-build-validate.js";

const driver = await createSetupSecurityDriver();

const cleanupRejection = (action, accounts = driver.envelope.cleanupInstruction?.accounts) => {
  const cleanup = driver.envelope.cleanupInstruction;
  if (!cleanup || !accounts) throw new Error("fixture lacked cleanup instruction");
  return cleanupBindingRejection(
    { ...driver.envelope, cleanupInstruction: { ...cleanup, accounts } },
    action,
    driver.taker,
  );
};

describe("setup and cleanup ownership bindings before signing", () => {
  test("the documented envelope passes every binding check", async () => {
    expect(await driver.rejectionFor({})).toBeUndefined();
  });

  test("an ATA create paid by an attacker is rejected", async () => {
    expect(await driver.withCreatedAccount(0, meta(POOL_AUTHORITY, true, false))).toContain(
      "payer was not the taker",
    );
  });

  test("an ATA create owned by an attacker is rejected", async () => {
    expect(await driver.withCreatedAccount(2, meta(POOL_AUTHORITY, false, false))).toContain(
      "owner was not the taker",
    );
  });

  test("an ATA create for an unrequested mint is rejected", async () => {
    expect(await driver.withCreatedAccount(3, meta(POOL_AUTHORITY, false, false))).toContain(
      "not one of the requested swap mints",
    );
  });

  test("an ATA create under the wrong token program is rejected", async () => {
    expect(await driver.withCreatedAccount(5, meta(TOKEN_2022_PROGRAM, false, false))).toContain(
      "did not target the taker's derived associated token account",
    );
  });

  test("cleanup is rejected when neither requested mint is wSOL", async () => {
    const action = {
      ...driver.action,
      inputMint: driver.action.outputMint,
      outputMint: POOL_AUTHORITY,
    };
    expect(await cleanupRejection(action)).toBe(
      "cleanup was not bound to one native-SOL swap direction",
    );
  });

  test("cleanup remains valid for a complete native-SOL input lifecycle", async () => {
    expect(await cleanupRejection(driver.action)).toBeUndefined();
  });

  test("cleanup rejects an output-wSOL build that also wraps native SOL", async () => {
    const unwrap = {
      ...driver.action,
      inputMint: driver.action.outputMint,
      outputMint: WSOL_MINT,
    };
    expect(await cleanupRejection(unwrap)).toBe(
      "cleanup of wrapped output carried an unsafe native-SOL wrap",
    );
  });

  test("cleanup accepts output wSOL only without a native-SOL wrap", async () => {
    const unwrap = {
      ...driver.action,
      inputMint: driver.action.outputMint,
      outputMint: WSOL_MINT,
    };
    const envelope = {
      ...driver.envelope,
      setupInstructions: driver.envelope.setupInstructions.filter(
        (ix) => ix.accounts.length !== 2 && ix.accounts.length !== 1,
      ),
    };
    expect(await cleanupBindingRejection(envelope, unwrap, driver.taker)).toBeUndefined();
  });

  test("a complete token-to-native build owns, credits, and closes its output wSOL ATA", async () => {
    const accounts = driver.envelope.swapInstruction.accounts;
    const setupInstructions = driver.envelope.setupInstructions.filter(
      (ix) => ix.accounts.length !== 2 && ix.accounts.length !== 1,
    );
    const swapInstruction = {
      ...driver.envelope.swapInstruction,
      accounts: [
        accounts[0],
        accounts[2],
        accounts[1],
        { ...accounts[3], pubkey: driver.action.outputMint },
        { ...accounts[4], pubkey: WSOL_MINT },
        ...accounts.slice(5),
      ],
    };
    const inverted = { inputMint: driver.action.outputMint, outputMint: WSOL_MINT };
    expect(
      await driver.rejectionForAction(
        { ...inverted, setupInstructions, swapInstruction },
        inverted,
      ),
    ).toBeUndefined();
  });

  test("cleanup rejects a build that did not create the temporary wSOL account", async () => {
    const envelope = {
      ...driver.envelope,
      setupInstructions: driver.envelope.setupInstructions.filter(
        (ix) => ix.programId !== ATA_PROGRAM || ix.accounts[1]?.pubkey !== driver.atas.sourceAta,
      ),
    };
    expect(await cleanupBindingRejection(envelope, driver.action, driver.taker)).toContain(
      "required this build to create",
    );
  });

  test("cleanup accepts both canonical ATA create opcodes for the temp account", async () => {
    for (const opcode of [0, 1]) {
      const envelope = {
        ...driver.envelope,
        setupInstructions: driver.envelope.setupInstructions.map((ix) =>
          ix.programId === ATA_PROGRAM && ix.accounts[1]?.pubkey === driver.atas.sourceAta
            ? { ...ix, data: b64(opcode) }
            : ix,
        ),
      };
      expect(await cleanupBindingRejection(envelope, driver.action, driver.taker)).toBeUndefined();
    }
  });

  test("cleanup rejects a temp create that is not a canonical ATA create", async () => {
    const envelope = {
      ...driver.envelope,
      setupInstructions: driver.envelope.setupInstructions.map((ix) =>
        ix.programId === ATA_PROGRAM && ix.accounts[1]?.pubkey === driver.atas.sourceAta
          ? { ...ix, data: b64(2) }
          : ix,
      ),
    };
    expect(await cleanupBindingRejection(envelope, driver.action, driver.taker)).toContain(
      "not a canonical single-instruction ATA create",
    );
  });

  test("cleanup rejects every account identity decoy", async () => {
    const accounts = driver.envelope.cleanupInstruction?.accounts;
    if (!accounts) throw new Error("fixture lacked cleanup instruction");
    const reasons = [
      "cleanup did not close the taker's temporary wSOL account",
      "cleanup rent destination was not the taker",
      "cleanup authority was not the taker",
    ];
    for (const [index, reason] of reasons.entries()) {
      const decoy = accounts.map((account, offset) =>
        offset === index ? { ...account, pubkey: POOL_AUTHORITY } : account,
      );
      expect(await cleanupRejection(driver.action, decoy)).toBe(reason);
    }
  });

  test("cleanup rejects every writable and signer role decoy", async () => {
    const accounts = driver.envelope.cleanupInstruction?.accounts;
    if (!accounts) throw new Error("fixture lacked cleanup instruction");
    const decoys = [
      accounts.map((account, index) => (index === 0 ? { ...account, isWritable: false } : account)),
      accounts.map((account, index) => (index === 0 ? { ...account, isSigner: true } : account)),
      accounts.map((account, index) => (index === 1 ? { ...account, isWritable: false } : account)),
      accounts.map((account, index) => (index === 1 ? { ...account, isSigner: true } : account)),
      accounts.map((account, index) => (index === 2 ? { ...account, isWritable: true } : account)),
      accounts.map((account, index) => (index === 2 ? { ...account, isSigner: false } : account)),
    ];
    for (const decoy of decoys) {
      expect(await cleanupRejection(driver.action, decoy)).toBe(
        "cleanup accounts carried invalid signer or writable roles",
      );
    }
  });
});
