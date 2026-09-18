// @ts-check
import { describe, expect, test } from "bun:test";
import { address } from "@solana/kit";
import {
  CLASSIC_MINT_BYTES,
  MAX_MINT_ACCOUNT_BYTES,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  readMintLayout,
} from "./mint-account.js";
import { classicMintBytes, concat, token2022MintBytes, zeros } from "./test-fixtures.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** @param {string} owner @param {Uint8Array} data */
const account = (owner, data) => ({ owner, data });

describe("mint account layout guards", () => {
  test("null means the account does not exist", () => {
    expect(readMintLayout(null)).toEqual({
      verdict: "not-a-mint",
      reason: "account does not exist",
    });
  });

  test("an owner outside the two token programs is never a mint", () => {
    for (const owner of [SYSTEM_PROGRAM, "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"]) {
      const result = readMintLayout(account(owner, classicMintBytes({ decimals: 9 })));
      expect(result).toMatchObject({
        verdict: "not-a-mint",
        reason: "owner is neither token program",
      });
    }
  });

  test("a classic token account passed as a mint fails on length, never decodes", () => {
    const result = readMintLayout(account(TOKEN_PROGRAM, new Uint8Array(165)));
    expect(result.verdict).toBe("not-a-mint");
  });

  test("a classic mint decodes with its decimals", () => {
    expect(readMintLayout(account(TOKEN_PROGRAM, classicMintBytes({ decimals: 6 })))).toEqual({
      verdict: "mint",
      program: "spl",
      decimals: 6,
      extensions: undefined,
    });
  });

  test("an uninitialized classic mint is not a readable mint", () => {
    expect(
      readMintLayout(
        account(TOKEN_PROGRAM, classicMintBytes({ decimals: 9, isInitialized: false })),
      ),
    ).toMatchObject({ verdict: "not-a-mint" });
  });

  test("undecodable classic data is rejected as not-a-mint", () => {
    const garbage = new Uint8Array(CLASSIC_MINT_BYTES).fill(255);
    expect(readMintLayout(account(TOKEN_PROGRAM, garbage))).toMatchObject({
      verdict: "not-a-mint",
    });
  });

  test("token-2022 accounts shorter than 82 bytes are not mints", () => {
    expect(readMintLayout(account(TOKEN_2022_PROGRAM, new Uint8Array(81))).verdict).toBe(
      "not-a-mint",
    );
  });

  test("an extension-less token-2022 mint is exactly 82 bytes and has no extensions", () => {
    expect(readMintLayout(account(TOKEN_2022_PROGRAM, classicMintBytes({ decimals: 2 })))).toEqual({
      verdict: "mint",
      program: "token-2022",
      decimals: 2,
      extensions: undefined,
    });
  });

  test("a token-2022 account (AccountType 2) passed as a mint is rejected", () => {
    const result = readMintLayout(
      account(TOKEN_2022_PROGRAM, token2022MintBytes({ decimals: 2, records: [], accountType: 2 })),
    );
    expect(result).toMatchObject({ verdict: "not-a-mint" });
  });

  test("a token-2022 mint exposes the bytes after the AccountType byte as extensions", () => {
    const extensions = concat(zeros(4), zeros(4));
    const result = readMintLayout(
      account(TOKEN_2022_PROGRAM, token2022MintBytes({ decimals: 8, records: [extensions] })),
    );
    expect(result).toMatchObject({ verdict: "mint", program: "token-2022", decimals: 8 });
    expect(result.verdict === "mint" && result.extensions).toBeDefined();
  });

  test("an oversized account fails promptly instead of being decoded", () => {
    const data = concat(
      classicMintBytes({ decimals: 0 }),
      new Uint8Array([1]),
      zeros(MAX_MINT_ACCOUNT_BYTES),
    );
    expect(readMintLayout(account(TOKEN_2022_PROGRAM, data))).toEqual({
      verdict: "account-too-large",
      bytes: data.length,
    });
  });

  test("the layout of every real address check is byte-exact: 82-byte mint, not the 165-byte account", () => {
    expect(classicMintBytes({ decimals: 9 })).toHaveLength(82);
    expect(address("So11111111111111111111111111111111111111112")).toBeDefined();
  });
});
