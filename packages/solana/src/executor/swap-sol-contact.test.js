// @ts-check
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { BuildRejected, RpcError } from "@solos/core";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { runBranch } from "./swap-sol-driver.js";
import { assertSwapWireBeforeContact } from "./swap-sol.js";

describe("the executor swap branch makes its first contact honestly", () => {
  test("a valid build signs; execution first contacts the lifetime gate", async () => {
    const { error, requests } = await runBranch("execute");
    expect(error).toBeInstanceOf(RpcError);
    expect(requests).toHaveLength(1);
  });

  test("a valid build signs; simulation first contacts simulation", async () => {
    const { error } = await runBranch("simulate");
    expect(error).toBeInstanceOf(RpcError);
  });

  test("a wrong-version wire is refused with zero RPC effect", async () => {
    const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(9));
    const message = setTransactionMessageFeePayerSigner(
      signer,
      createTransactionMessage({ version: 0 }),
    );
    const signed = await signTransactionMessageWithSigners(
      /** @type {Parameters<typeof signTransactionMessageWithSigners>[0]} */
      /** @type {unknown} */ (message),
    );
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
