// @ts-check
import { describe, expect, test } from "bun:test";
import { POOL_AUTHORITY } from "./jupiter-swap-build-bodies.js";
import { createSetupSecurityDriver, meta } from "./jupiter-swap-build-setup-security-driver.js";
import { TOKEN_2022_PROGRAM } from "./jupiter-swap-build-validate.js";

const driver = await createSetupSecurityDriver();

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
});
