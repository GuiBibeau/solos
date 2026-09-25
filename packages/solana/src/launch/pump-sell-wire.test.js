// @ts-check
/**
 * The sell's wire form, pinned against the IDL at the commit in `pump-program.js`.
 *
 * `sell_v2` is the buy's account list with one account removed: the IDL at the pinned commit
 * lists 26 accounts in the same order as `buy_exact_quote_in_v2`'s 27, without
 * `global_volume_accumulator` (buy index 19). The sell derives its list from the buy's for that
 * reason, so the assertion that matters most here is that the removal is at that index and
 * nothing else shifted — if upstream reorders either instruction, this fails instead of the
 * wallet.
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
  sellAccounts,
  sharingConfigAddress,
  userVolumeAccumulatorAddress,
} from "./pump-buy-accounts.js";
import { SELL_V2_DISCRIMINATOR, encodeSellV2 } from "./pump-buy-instruction.js";
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

describe("pump sell wire form", () => {
  test("instruction data is the pinned discriminator, the token amount and the SOL floor", () => {
    const data = encodeSellV2({ tokensIn: 4200n, minSolOutput: 100_000_000n });
    expect(data.slice(0, 8)).toEqual(Uint8Array.from(SELL_V2_DISCRIMINATOR));
    expect(data).toHaveLength(24);
    const u64 = getU64Decoder();
    expect(u64.decode(data.slice(8, 16))).toBe(4200n);
    expect(u64.decode(data.slice(16, 24))).toBe(100_000_000n);
  });

  test("the args are not the buy's: tokens in first, then the SOL floor", () => {
    const data = encodeSellV2({ tokensIn: 1n, minSolOutput: 2n });
    const u64 = getU64Decoder();
    expect(u64.decode(data.slice(8, 16))).toBe(1n);
    expect(u64.decode(data.slice(16, 24))).toBe(2n);
  });

  test("u64 arguments survive the full unsigned range", () => {
    const max = 18_446_744_073_709_551_615n;
    const data = encodeSellV2({ tokensIn: max, minSolOutput: max });
    const u64 = getU64Decoder();
    expect(u64.decode(data.slice(8, 16))).toBe(max);
    expect(u64.decode(data.slice(16, 24))).toBe(max);
  });

  test("the account list is 26 accounts in the IDL's order, roles and fixed programs", async () => {
    const accounts = await sellAccounts(inputs);
    expect(accounts).toHaveLength(26);
    expect(accounts[0]).toMatchObject({ address: GLOBAL, writable: false });
    expect(accounts[1]).toMatchObject({ address: MINT, writable: false });
    expect(accounts[2]).toMatchObject({ address: WSOL_MINT, writable: false });
    expect(accounts[5]).toMatchObject({ address: ATA_PROGRAM });
    expect(accounts[6]).toMatchObject({ address: FEE_RECIPIENT, writable: true });
    expect(accounts[8]).toMatchObject({ address: BUYBACK, writable: true });
    expect(accounts[10]).toMatchObject({ address: CURVE, writable: true });
    expect(accounts[13]).toMatchObject({ address: USER, writable: true, signer: true });
    expect(accounts[22]).toMatchObject({ address: PUMP_FEE_PROGRAM });
    expect(accounts[23]).toMatchObject({ address: SYSTEM_PROGRAM });
    expect(accounts[25]).toMatchObject({ address: PUMP_PROGRAM });
    expect(accounts.filter((account) => account.signer)).toHaveLength(1);
  });

  test("every derived account matches its own seed derivation", async () => {
    const accounts = await sellAccounts(inputs);
    expect(accounts[16].address).toBe(await creatorVaultAddress(CREATOR));
    expect(accounts[18].address).toBe(await sharingConfigAddress(MINT));
    expect(accounts[19].address).toBe(await userVolumeAccumulatorAddress(USER));
    expect(accounts[21].address).toBe(await feeConfigAddress());
    expect(accounts[24].address).toBe(await eventAuthorityAddress());
  });

  test("only the global volume accumulator is dropped, and the tail shifts by exactly one", async () => {
    const [buy, sell] = await Promise.all([buyAccounts(inputs), sellAccounts(inputs)]);
    const globalVolume = await globalVolumeAccumulatorAddress();
    expect(buy[19].address).toBe(globalVolume);
    expect(sell.map((account) => account.address)).not.toContain(globalVolume);
    expect(sell.slice(0, 19)).toEqual(buy.slice(0, 19));
    expect(sell.slice(19)).toEqual(buy.slice(20));
  });
});
