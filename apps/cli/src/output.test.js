// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { BuildRejected, TransactionFailed } from "@solos/core";
import { Effect } from "effect";
import { exitOnFailure } from "./output.js";

const SIGNATURE = "5".repeat(88);
const MAY_HAVE_LANDED =
  "confirmation was not established before the deadline; the transaction may still have landed";

describe("CLI execute reporting of domain errors", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  test("TransactionFailed after submit writes the signature to stderr, never silence", async () => {
    process.exitCode = 0;
    /** @type {string[]} */
    const chunks = [];
    const original = process.stderr.write;
    process.stderr.write = (chunk) => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      await Effect.runPromise(
        exitOnFailure(
          Effect.fail(new TransactionFailed({ signature: SIGNATURE, reason: MAY_HAVE_LANDED })),
        ),
      );
      expect(process.exitCode).toBe(1);
      expect(JSON.parse(chunks.join(""))).toEqual({
        error: { code: "TransactionFailed", signature: SIGNATURE, reason: MAY_HAVE_LANDED },
      });
    } finally {
      process.stderr.write = original;
    }
  });

  test("a remedy travels to stderr beside the reason, so the reader learns the next action", async () => {
    process.exitCode = 0;
    /** @type {string[]} */
    const chunks = [];
    const original = process.stderr.write;
    process.stderr.write = (chunk) => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      await Effect.runPromise(
        exitOnFailure(
          Effect.fail(
            new BuildRejected({
              reason: "the funding account does not exist",
              remedy: "pass wrapSol: true to wrap native SOL for this side",
            }),
          ),
        ),
      );
      expect(JSON.parse(chunks.join(""))).toEqual({
        error: {
          code: "BuildRejected",
          reason: "the funding account does not exist",
          remedy: "pass wrapSol: true to wrap native SOL for this side",
        },
      });
    } finally {
      process.stderr.write = original;
    }
  });
});
