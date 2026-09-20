// @ts-check
import { describe, expect, test } from "bun:test";
import { POOL_AUTHORITY } from "./jupiter-swap-build-bodies.js";
import { cleanupBindingRejection } from "./jupiter-swap-build-setup-account.js";
import { createSetupSecurityDriver, meta } from "./jupiter-swap-build-setup-security-driver.js";
import { TOKEN_2022_PROGRAM, WSOL_MINT } from "./jupiter-swap-build-validate.js";

const driver = await createSetupSecurityDriver();

const cleanupRejection = (action, accounts = driver.envelope.cleanupInstruction?.accounts) => {
  const cleanup = driver.envelope.cleanupInstruction;
  if (!cleanup || !accounts) throw new Error("fixture lacked cleanup instruction");
  return cleanupBindingRejection({ ...cleanup, accounts }, action, driver.taker);
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
      "cleanup was present for a swap that did not involve wSOL",
    );
  });

  test("cleanup remains valid for both the native-SOL input and output directions", async () => {
    expect(await cleanupRejection(driver.action)).toBeUndefined();
    const unwrap = {
      ...driver.action,
      inputMint: driver.action.outputMint,
      outputMint: WSOL_MINT,
    };
    expect(await cleanupRejection(unwrap)).toBeUndefined();
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
