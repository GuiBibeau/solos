// @ts-check
/**
 * Walking a Token-2022 mint for an active transfer hook.
 *
 * `TransferHook` is extension type 14: 32-byte authority, then 32-byte program id.
 * A zero program id is the disabled form. A short record cannot prove that, so it
 * counts as active and the liquidity adapters refuse the mint.
 */
import { describe, expect, test } from "bun:test";
import { concat, tlvRecord, zeros } from "./test-fixtures.js";
import { TRANSFER_HOOK, hasActiveTransferHook } from "./token-2022-layout.js";

/** @param {number} [last] */
const hookValue = (last = 0) => {
  const bytes = zeros(64);
  bytes[63] = last;
  return bytes;
};

describe("token-2022 transfer-hook detection", () => {
  test("no extension area and a zero program id are not a hook", () => {
    expect(hasActiveTransferHook(undefined)).toBe(false);
    expect(hasActiveTransferHook(new Uint8Array(0))).toBe(false);
    expect(hasActiveTransferHook(tlvRecord(TRANSFER_HOOK, hookValue(0)))).toBe(false);
    const authorityOnly = hookValue(0);
    authorityOnly[0] = 1;
    expect(hasActiveTransferHook(tlvRecord(TRANSFER_HOOK, authorityOnly))).toBe(false);
  });

  test("a set program id is a hook, including when another extension precedes it", () => {
    expect(hasActiveTransferHook(tlvRecord(TRANSFER_HOOK, hookValue(1)))).toBe(true);
    const area = concat(tlvRecord(3, zeros(32)), tlvRecord(TRANSFER_HOOK, hookValue(1)));
    expect(hasActiveTransferHook(area)).toBe(true);
  });

  test("a truncated hook record fails closed", () => {
    expect(hasActiveTransferHook(tlvRecord(TRANSFER_HOOK, zeros(8)))).toBe(true);
    expect(hasActiveTransferHook(new Uint8Array([14, 0, 64, 0, 1, 2, 3, 4]))).toBe(true);
  });
});
