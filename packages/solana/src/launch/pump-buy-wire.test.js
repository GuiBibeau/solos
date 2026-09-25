// @ts-check
/**
 * The buy's wire form, pinned against the IDL at the commit in `pump-program.js`.
 *
 * `buy_exact_quote_in_v2` is not covered by the published instruction docs, so the IDL is the
 * whole contract and these assertions are what make an upstream change fail here instead of on
 * chain. The 16-account `buy_exact_sol_in` was tried first and the deployed program refused it
 * with `BuybackFeeRecipientMissing`, which is why the account count below is 27.
 */
import { describe, expect, test } from "bun:test";
import { getU64Decoder } from "@solana/kit";
import {
  ATA_PROGRAM,
  PUMP_FEE_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  WSOL_MINT,
  buyAccounts,
  creatorVaultAddress,
  eventAuthorityAddress,
  feeConfigAddress,
  globalVolumeAccumulatorAddress,
  sharingConfigAddress,
  userVolumeAccumulatorAddress,
} from "./pump-buy-accounts.js";
import {
  BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR,
  encodeBuyExactQuoteInV2,
} from "./pump-buy-instruction.js";
import { PUMP_PROGRAM } from "./pump-program.js";

const MINT = "UYGGYygeDt9SfsVBf2qBNtU4bFPhrR6DVVCRf7fpump";
const USER = "E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f";
const CREATOR = "7yecFGMRPmQcHUyrCRkQyDbTeBQhTBzE6LXZ9nQS3Mbq";
const CURVE = "BiSoNHyQvFAYK1CSSuBEZWjQLvNGnFpB1gEpZ2jWSQ4k";
const GLOBAL = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";
const FEE_RECIPIENT = "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV";
const BUYBACK = "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD";

const inputs = {
  mint: MINT,
  user: USER,
  creator: CREATOR,
  feeRecipient: FEE_RECIPIENT,
  buybackFeeRecipient: BUYBACK,
  bondingCurve: CURVE,
  global: GLOBAL,
  baseTokenProgram: TOKEN_PROGRAM,
};

describe("pump buy wire form", () => {
  test("instruction data is the pinned discriminator and two u64 args, with no track_volume", () => {
    const data = encodeBuyExactQuoteInV2({ spendableQuoteIn: 100_000_000n, minTokensOut: 4200n });
    expect(data.slice(0, 8)).toEqual(Uint8Array.from(BUY_EXACT_QUOTE_IN_V2_DISCRIMINATOR));
    // 8 discriminator + 8 + 8. The v2 form drops the OptionBool the 16-account variants carry.
    expect(data).toHaveLength(24);
    const u64 = getU64Decoder();
    expect(u64.decode(data.slice(8, 16))).toBe(100_000_000n);
    expect(u64.decode(data.slice(16, 24))).toBe(4200n);
  });

  test("u64 arguments survive the full unsigned range", () => {
    const max = 18_446_744_073_709_551_615n;
    const data = encodeBuyExactQuoteInV2({ spendableQuoteIn: max, minTokensOut: max });
    const u64 = getU64Decoder();
    expect(u64.decode(data.slice(8, 16))).toBe(max);
    expect(u64.decode(data.slice(16, 24))).toBe(max);
  });

  test("the account list is the IDL's order, roles and fixed programs", async () => {
    const accounts = await buyAccounts(inputs);
    expect(accounts).toHaveLength(27);
    // The instruction is positional: these indices are the contract.
    expect(accounts[0]).toMatchObject({ address: GLOBAL, writable: false });
    expect(accounts[1]).toMatchObject({ address: MINT, writable: false });
    expect(accounts[2]).toMatchObject({ address: WSOL_MINT, writable: false });
    expect(accounts[5]).toMatchObject({ address: ATA_PROGRAM });
    expect(accounts[6]).toMatchObject({ address: FEE_RECIPIENT, writable: true });
    expect(accounts[8]).toMatchObject({ address: BUYBACK, writable: true });
    expect(accounts[10]).toMatchObject({ address: CURVE, writable: true });
    expect(accounts[13]).toMatchObject({ address: USER, writable: true, signer: true });
    expect(accounts[23]).toMatchObject({ address: PUMP_FEE_PROGRAM });
    expect(accounts[24]).toMatchObject({ address: SYSTEM_PROGRAM });
    expect(accounts[26]).toMatchObject({ address: PUMP_PROGRAM });
    expect(accounts.filter((account) => account.signer)).toHaveLength(1);
  });

  test("every derived account matches its own seed derivation", async () => {
    const accounts = await buyAccounts(inputs);
    expect(accounts[16].address).toBe(await creatorVaultAddress(CREATOR));
    expect(accounts[18].address).toBe(await sharingConfigAddress(MINT));
    expect(accounts[19].address).toBe(await globalVolumeAccumulatorAddress());
    expect(accounts[20].address).toBe(await userVolumeAccumulatorAddress(USER));
    expect(accounts[22].address).toBe(await feeConfigAddress());
    expect(accounts[25].address).toBe(await eventAuthorityAddress());
  });

  test("the creator vault follows the curve's creator, not the buyer", async () => {
    expect(await creatorVaultAddress(CREATOR)).not.toBe(await creatorVaultAddress(USER));
  });

  test("the sharing config is per coin and the volume accumulator per buyer", async () => {
    expect(await sharingConfigAddress(MINT)).not.toBe(await sharingConfigAddress(WSOL_MINT));
    expect(await userVolumeAccumulatorAddress(USER)).not.toBe(
      await userVolumeAccumulatorAddress(CREATOR),
    );
  });
});
