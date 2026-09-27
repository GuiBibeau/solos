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
import { SLOW } from "../submission/mode.js";
import { simulateSigned, submitSigned } from "../submission/submission.js";
import { randomSeed } from "../surfnet/test-surfnet.js";

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

/** A Submitter that counts any contact: the wire check must refuse before delivery too. */
/** @param {{ count: number }} contacts @returns {import("../submission/submitter.js").SubmitterShape} */
const guardedSubmitter = (contacts) => ({
  name: "guarded",
  send: () => Effect.sync(() => void (contacts.count += 1)),
  status: () => Effect.sync(() => (contacts.count += 1)),
});

/** @param {{ count: number }} contacts */
const guardedSubmission = (contacts) => ({
  ctx: /** @type {import("../rpc/solana-rpc.js").SolanaRpcShape} */ (
    /** @type {unknown} */ (guardedContext(contacts))
  ),
  submitter: guardedSubmitter(contacts),
  mode: SLOW,
});

/** @type {ReadonlyArray<(deps: ReturnType<typeof guardedSubmission>, signed: any) => Effect.Effect<unknown, unknown>>} */
const halves = [
  (deps, signed) => simulateSigned(deps, { signed }),
  (deps, signed) => submitSigned(deps, { signed }, { skipSimulation: false }),
];

describe("transaction v1 RPC boundary [integration]", () => {
  test("legacy and v0 wire mutations reach neither simulation nor submission RPC", async () => {
    for (const version of /** @type {const} */ (["legacy", 0])) {
      const signed = await signedOld(version);
      for (const operation of halves) {
        const contacts = { count: 0 };
        const exit = await Effect.runPromiseExit(operation(guardedSubmission(contacts), signed));
        expect(Exit.isFailure(exit)).toBe(true);
        expect(JSON.stringify(exit)).toContain("BuildRejected");
        expect(contacts.count).toBe(0);
      }
    }
  });
});
