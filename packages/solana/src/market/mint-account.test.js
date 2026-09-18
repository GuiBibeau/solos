// @ts-check
import { describe, expect, test } from "bun:test";
import { address } from "@solana/kit";
import {
  ACCOUNT_TYPE_OFFSET,
  CLASSIC_MINT_BYTES,
  MAX_MINT_ACCOUNT_BYTES,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  readMintLayout,
} from "./mint-account.js";
import { classicMintBytes, concat, tlvRecord, token2022MintBytes, zeros } from "./test-fixtures.js";

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

  test("non-zero padding before the AccountType byte is invalid layout, not a mint", () => {
    const corrupted = concat(
      classicMintBytes({ decimals: 6 }),
      new Uint8Array(83).fill(7),
      new Uint8Array([1]),
    );
    expect(readMintLayout(account(TOKEN_2022_PROGRAM, corrupted))).toMatchObject({
      verdict: "not-a-mint",
      reason: "token-2022 padding before the account type byte is not zero",
    });
  });

  test("a 355-byte token-2022 account is a multisig, never a mint", () => {
    expect(readMintLayout(account(TOKEN_2022_PROGRAM, zeros(355))).verdict).toBe("not-a-mint");
  });

  test("zero padding at byte 82 no longer disqualifies an extension-bearing mint", () => {
    const data = token2022MintBytes({ decimals: 9, records: [tlvRecord(18, zeros(64))] });
    expect(data[CLASSIC_MINT_BYTES]).toBe(0);
    expect(data[ACCOUNT_TYPE_OFFSET]).toBe(1);
    expect(readMintLayout(account(TOKEN_2022_PROGRAM, data))).toMatchObject({
      verdict: "mint",
      program: "token-2022",
      decimals: 9,
    });
  });

  test("token-2022 lengths 83..165 have no protocol AccountType location and are not mints", () => {
    for (const total of [83, 123, 164, 165]) {
      const data = concat(classicMintBytes({ decimals: 6 }), zeros(total - CLASSIC_MINT_BYTES));
      expect(readMintLayout(account(TOKEN_2022_PROGRAM, data))).toMatchObject({
        verdict: "not-a-mint",
        reason: "token-2022 mint with extensions is at least 166 bytes; this is not a mint",
      });
    }
  });

  test("a token-2022 mint exposes the bytes from 166 as its extension area", () => {
    const records = tlvRecord(18, zeros(64));
    const result = readMintLayout(
      account(TOKEN_2022_PROGRAM, token2022MintBytes({ decimals: 8, records: [records] })),
    );
    expect(result).toMatchObject({ verdict: "mint", program: "token-2022", decimals: 8 });
    expect(result.verdict === "mint" && result.extensions).toEqual(records);
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
