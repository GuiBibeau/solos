// @ts-check
import { describe, expect, test } from "bun:test";
import { RpcError, UnsupportedAction } from "@solos/core";
import { TOKEN_2022_PROGRAM } from "../swap/jupiter-swap-build-validate.js";
import {
  attackerAddress,
  reasonOf,
  rebindCleanup,
  rebindCreate,
  runBranch,
  withWrapAmount,
  withWrapForm,
} from "./swap-sol-driver.js";

const attacker = await attackerAddress();

describe("the executor swap branch refuses before any contact [integration]", () => {
  // A pump venue is now built against the bonding curve rather than refused. It must still
  // never reach Jupiter: the route comes from the Action, and a pump buy has no build request.
  test("an explicit pump venue never reaches a Jupiter build request", async () => {
    const { error, requests } = await runBranch("execute", undefined, { venue: "pump" });
    expect(requests).toHaveLength(0);
    // The driver's RPC points at a closed port, so the buy stops at its first curve read.
    expect(error).not.toBeInstanceOf(UnsupportedAction);
  });

  test("any other explicit venue is unsupported and never reaches a build request", async () => {
    const { error, requests } = await runBranch("execute", undefined, {
      venue: /** @type {"jupiter"} */ ("raydium"),
    });
    expect(error).toBeInstanceOf(UnsupportedAction);
    expect(/** @type {UnsupportedAction} */ (error)?.actionType).toBe("swap:raydium");
    expect(requests).toHaveLength(0);
  });

  test("an explicit jupiter venue takes the Jupiter path", async () => {
    const { error, requests } = await runBranch("execute", undefined, { venue: "jupiter" });
    expect(error).toBeInstanceOf(RpcError);
    expect(requests).toHaveLength(1);
  });

  test("an ATA create paid by a signing attacker is refused by the signer allowlist", async () => {
    const { error, requests } = await runBranch("execute", rebindCreate(0, { pubkey: attacker }));
    expect(reasonOf(error)).toBe("an account outside the configured signer was required to sign");
    expect(requests).toHaveLength(1);
  });

  test("an ATA create paid by a non-signing attacker is refused by the payer binding", async () => {
    const { error } = await runBranch(
      "execute",
      rebindCreate(0, { pubkey: attacker, isSigner: false }),
    );
    expect(reasonOf(error)).toBe("setup ATA create payer was not the taker");
  });

  test("an ATA create owned by an attacker is refused by the owner binding", async () => {
    const { error } = await runBranch("execute", rebindCreate(2, { pubkey: attacker }));
    expect(reasonOf(error)).toBe("setup ATA create owner was not the taker");
  });

  // A multi-hop route opens the taker's account for its intermediate token, so the mint is not
  // restricted to the requested pair. Substituting one still has to survive the derivation: the
  // account must be the canonical ATA for whatever mint is named (ADR-0024 lineage).
  test("an ATA create for another mint must still target that mint's derived account", async () => {
    const { error } = await runBranch("execute", rebindCreate(3, { pubkey: attacker }));
    expect(reasonOf(error)).toBe(
      "setup ATA create did not target the taker's derived associated token account",
    );
  });

  test("a Token-2022 program paired with a classic-token ATA is refused", async () => {
    const { error } = await runBranch("execute", rebindCreate(5, { pubkey: TOKEN_2022_PROGRAM }));
    expect(reasonOf(error)).toBe(
      "setup ATA create did not target the taker's derived associated token account",
    );
  });

  test("wSOL funding off the exact requested amount is refused", async () => {
    const { error } = await runBranch("execute", withWrapAmount(123n));
    expect(reasonOf(error)).toBe("setup transfer did not carry the exact requested input amount");
  });

  test("short wSOL funding data is refused as a non-canonical transfer", async () => {
    const { error } = await runBranch("execute", withWrapForm([2, 0, 0, 0, 1, 2, 3]));
    expect(reasonOf(error)).toBe("setup transfer was not the canonical 12-byte System transfer");
  });

  test("wSOL funding with trailing bytes is refused as non-canonical", async () => {
    const { error } = await runBranch(
      "execute",
      withWrapForm([2, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 255]),
    );
    expect(reasonOf(error)).toBe("setup transfer was not the canonical 12-byte System transfer");
  });

  test("a wrong System discriminator is refused by the form allowlist", async () => {
    const { error } = await runBranch(
      "execute",
      withWrapForm([3, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0]),
    );
    expect(reasonOf(error)).toBe("setup carried an unknown System instruction");
  });

  test("cleanup with an attacker rent destination is refused", async () => {
    const { error } = await runBranch("execute", rebindCleanup(1, { pubkey: attacker }));
    expect(reasonOf(error)).toBe("cleanup rent destination was not the taker");
  });

  test("cleanup with an attacker authority is refused by the signer allowlist", async () => {
    const { error } = await runBranch("execute", rebindCleanup(2, { pubkey: attacker }));
    expect(reasonOf(error)).toBe("an account outside the configured signer was required to sign");
  });
});
