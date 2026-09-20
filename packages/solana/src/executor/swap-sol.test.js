// @ts-check
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  createTransactionMessage,
  getU16Codec,
  getU32Codec,
  getU64Codec,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { BuildRejected, RpcError, UnsupportedAction } from "@solos/core";
import { AMOUNT, OUT_AMOUNT } from "../swap/jupiter-swap-build-bodies.js";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { ROUTE_DISCRIMINATOR } from "../swap/jupiter-swap-build-swapdata.js";
import { TOKEN_2022_PROGRAM } from "../swap/jupiter-swap-build-validate.js";
import {
  attackerAddress,
  reasonOf,
  rebindCleanup,
  rebindCreate,
  runBranch,
  withSwapData,
  withWrapAmount,
  withWrapForm,
} from "./swap-sol-driver.js";
import { assertSwapWireBeforeContact } from "./swap-sol.js";

/**
 * The executor's swap branch over the real DirectSignerExecutor with a dead RPC port and a stub
 * build Layer. A BuildRejected here proves refusal before any chain contact (the dead port
 * would surface as RpcError); an RpcError proves validation and signing passed and the first
 * contact is exactly the lifetime gate or the simulation — never a send.
 */

const attacker = await attackerAddress();

/** The supported route payload over the given u64 amounts, exactly as the fixture encodes it. */
/** @param {bigint} inAmount @param {bigint} quotedOutAmount */
const routeData = (inAmount, quotedOutAmount) =>
  Uint8Array.of(
    ...ROUTE_DISCRIMINATOR,
    ...getU32Codec().encode(0),
    ...getU64Codec().encode(inAmount),
    ...getU64Codec().encode(quotedOutAmount),
    50,
    0,
    ...getU16Codec().encode(0),
  );

describe("the executor swap branch refuses before any contact", () => {
  test("an explicit pump venue fails before any build request", async () => {
    const { error, requests } = await runBranch("execute", undefined, { venue: "pump" });
    expect(error).toBeInstanceOf(UnsupportedAction);
    expect(/** @type {UnsupportedAction} */ (error)?.actionType).toBe("swap:pump");
    expect(requests).toHaveLength(0);
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

  test("an ATA create for an unrequested mint is refused", async () => {
    const { error } = await runBranch("execute", rebindCreate(3, { pubkey: attacker }));
    expect(reasonOf(error)).toBe("setup ATA create mint was not one of the requested swap mints");
  });

  test("an ATA create under an attacker token program does not derive to the taker's account", async () => {
    const { error } = await runBranch("execute", rebindCreate(5, { pubkey: TOKEN_2022_PROGRAM }));
    expect(reasonOf(error)).toBe(
      "setup ATA create did not target the taker's derived associated token account",
    );
  });

  test("wSOL funding off the exact requested amount is refused", async () => {
    const { error } = await runBranch("execute", withWrapAmount(123n));
    expect(reasonOf(error)).toBe("setup transfer did not carry the exact requested input amount");
  });

  test("short wSOL funding data is refused as a non-canonical System transfer", async () => {
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

  test("a wrong System discriminator behind the wSOL wrap is refused by the form allowlist", async () => {
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

describe("the swap payload is bound to the validated intent before signing", () => {
  test("an embedded input amount other than the requested one is refused", async () => {
    const { error, requests } = await runBranch(
      "execute",
      withSwapData([...routeData(BigInt(AMOUNT) + 1n, BigInt(OUT_AMOUNT))]),
    );
    expect(reasonOf(error)).toBe("swap instruction data did not carry the requested input amount");
    expect(requests).toHaveLength(1);
  });

  test("an embedded quoted output other than the envelope's is refused", async () => {
    const { error } = await runBranch(
      "execute",
      withSwapData([...routeData(BigInt(AMOUNT), BigInt(OUT_AMOUNT) - 1n)]),
    );
    expect(reasonOf(error)).toBe("swap instruction data did not carry the quoted envelope output");
  });

  test("an unknown discriminator is refused as an unsupported layout", async () => {
    const bytes = [...routeData(BigInt(AMOUNT), BigInt(OUT_AMOUNT))];
    bytes[0] = (bytes[0] + 1) % 256;
    const { error } = await runBranch("execute", withSwapData(bytes));
    expect(reasonOf(error)).toBe(
      "swap instruction data was not the supported Jupiter route layout",
    );
  });

  test("truncated swap data is refused as an unsupported layout", async () => {
    const bytes = [...routeData(BigInt(AMOUNT), BigInt(OUT_AMOUNT))].slice(0, 31);
    const { error } = await runBranch("execute", withSwapData(bytes));
    expect(reasonOf(error)).toBe(
      "swap instruction data was not the supported Jupiter route layout",
    );
  });

  test("an amount beyond u64 is refused before any build request", async () => {
    const { error, requests } = await runBranch("execute", undefined, {
      amount: "18446744073709551616",
    });
    expect(reasonOf(error)).toBe("swap amount exceeded the u64 bound the executor can assemble");
    expect(requests).toHaveLength(0);
  });
});

describe("the executor swap branch makes its first contact honestly", () => {
  test("a valid build signs; execution's first contact is the lifetime gate", async () => {
    const { error, requests } = await runBranch("execute");
    expect(error).toBeInstanceOf(RpcError);
    expect(requests).toHaveLength(1);
  });

  test("a valid build signs; simulation of that exact transaction is simulation's first contact", async () => {
    const { error } = await runBranch("simulate");
    expect(error).toBeInstanceOf(RpcError);
  });

  test("a wrong-version wire is refused by the pre-submit boundary with zero RPC effect", async () => {
    const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(9));
    const message = setTransactionMessageFeePayerSigner(
      signer,
      createTransactionMessage({ version: 0 }),
    );
    const signed = await signTransactionMessageWithSigners(
      /** @type {Parameters<typeof signTransactionMessageWithSigners>[0]} */
      /** @type {unknown} */ (message),
    );
    // The boundary consumes only wire bytes — its effect environment is empty, so a refusal is
    // structurally zero-contact: there is no port here that could dial anything.
    const error = await failureOf(assertSwapWireBeforeContact(signed));
    expect(error).toBeInstanceOf(BuildRejected);
  });

  test("the wire assertion precedes every RPC call in execute", () => {
    const source = readFileSync(new URL("direct-signer-executor.js", import.meta.url), "utf8");
    const wire = source.indexOf("assertSwapWireBeforeContact(swap.signed)");
    const gate = source.indexOf("gateSwapLifetime(ctx, swap.envelope)");
    expect(wire).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(wire);
  });
});
