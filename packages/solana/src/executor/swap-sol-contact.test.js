// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { BuildRejected, RpcError } from "@solos/core";
import { seal } from "../submission/sealed.js";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { runBranch } from "./swap-sol-driver.js";

describe("the executor swap branch makes its first contact honestly [integration]", () => {
  test("a valid build reaches the account preflight through the real RPC adapter", async () => {
    const { error, requests } = await runBranch("execute");
    expect(error).toBeInstanceOf(RpcError);
    expect(requests).toHaveLength(1);
  });

  test("simulation uses the same account preflight", async () => {
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
    const error = await failureOf(seal(/** @type {any} */ (signed)));
    expect(error).toBeInstanceOf(BuildRejected);
  });
});
