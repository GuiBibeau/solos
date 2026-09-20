// @ts-check
import { describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  address,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { Effect, Exit } from "effect";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { sendSigned, simulateSigned } from "./transfer-sol.js";

/** @param {0 | "legacy"} version */
const signedOld = async (version) => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  const message = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: address("11111111111111111111111111111111"), lastValidBlockHeight: 1n },
    setTransactionMessageFeePayerSigner(signer, createTransactionMessage({ version })),
  );
  return signTransactionMessageWithSigners(message);
};

const guardedContext = (contacts) => ({
  get url() {
    contacts.count += 1;
    return "http://127.0.0.1:1";
  },
  get rpc() {
    contacts.count += 1;
    throw new Error("RPC must not be touched");
  },
  get rpcSubscriptions() {
    contacts.count += 1;
    throw new Error("subscriptions must not be touched");
  },
});

describe("transaction v1 RPC boundary", () => {
  test("legacy and v0 wire mutations reach neither simulation nor submission RPC", async () => {
    for (const version of /** @type {const} */ (["legacy", 0])) {
      const signed = await signedOld(version);
      for (const operation of [simulateSigned, sendSigned]) {
        const contacts = { count: 0 };
        const exit = await Effect.runPromiseExit(operation(guardedContext(contacts), signed));
        expect(Exit.isFailure(exit)).toBe(true);
        expect(JSON.stringify(exit)).toContain("BuildRejected");
        expect(contacts.count).toBe(0);
      }
    }
  });
});
