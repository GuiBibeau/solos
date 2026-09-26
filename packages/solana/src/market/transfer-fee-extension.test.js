// @ts-check
/**
 * Walking a Token-2022 extension area for the one extension that changes what an amount means.
 *
 * A transfer fee makes plain Uniswap-V3 quoting wrong in both directions — a deposit's budget
 * would exclude the fee, a removal's minimum would be quoted before it — so the liquidity
 * adapters refuse such a pool (ADR-0022). Everything here is about not missing one.
 */
import { describe, expect, test } from "bun:test";
import { concat, tlvRecord, zeros } from "./test-fixtures.js";
import { TRANSFER_FEE_CONFIG, hasTransferFee } from "./token-2022-layout.js";

/** TransferFeeConfig::LEN, the size a real fee-bearing mint declares. */
const TRANSFER_FEE_CONFIG_LEN = 116;

const feeRecord = () => tlvRecord(TRANSFER_FEE_CONFIG, zeros(TRANSFER_FEE_CONFIG_LEN));

describe("token-2022 transfer-fee detection", () => {
  test("a mint with no extension area has no fee", () => {
    expect(hasTransferFee(undefined)).toBe(false);
    expect(hasTransferFee(new Uint8Array(0))).toBe(false);
  });

  test("a transfer-fee config is found as the only record", () => {
    expect(hasTransferFee(feeRecord())).toBe(true);
  });

  test("it is found after other extensions, not only first", () => {
    const area = concat(tlvRecord(3, zeros(32)), tlvRecord(18, zeros(64)), feeRecord());
    expect(hasTransferFee(area)).toBe(true);
  });

  test("other extensions alone are not a fee", () => {
    // 3 is MintCloseAuthority — the one the position NFT itself carries.
    expect(hasTransferFee(concat(tlvRecord(3, zeros(32)), tlvRecord(18, zeros(64))))).toBe(false);
  });

  test("a record whose length would overrun the area ends the walk instead of throwing", () => {
    // A four-byte header claiming 200 bytes of value with none present.
    const header = new Uint8Array([7, 0, 200, 0]);
    expect(() => hasTransferFee(header)).not.toThrow();
    expect(hasTransferFee(header)).toBe(false);
  });

  test("a truncated header ends the walk instead of reading past the end", () => {
    expect(hasTransferFee(new Uint8Array([1, 0, 4]))).toBe(false);
  });

  test("a zero-length record does not spin", () => {
    const area = concat(new Uint8Array([9, 0, 0, 0]), feeRecord());
    expect(hasTransferFee(area)).toBe(true);
  });
});
