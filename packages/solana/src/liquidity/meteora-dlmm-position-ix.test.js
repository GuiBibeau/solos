// @ts-check
import { describe, expect, test } from "bun:test";
import { AccountRole } from "@solana/kit";
import {
  CLOSE_POSITION2_DISCRIMINATOR,
  INITIALIZE_POSITION_DISCRIMINATOR,
  closeCoverageIndexes,
  closePosition2Instruction,
  initializePositionData,
  initializePositionInstruction,
} from "./meteora-dlmm-position-ix.js";

const PAYER = "11111111111111111111111111111111";
const POSITION = "So11111111111111111111111111111111111111112";
const PAIR = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const EVENT = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const ARRAY_LOWER = "SysvarC1ock11111111111111111111111111111111";
const ARRAY_NEXT = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const i32At = (/** @type {Uint8Array} */ data, /** @type {number} */ offset) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getInt32(offset, true);

describe("meteora position instructions", () => {
  test("initialize_position encodes the caller's bin window and a second writable signer", () => {
    const data = initializePositionData({ lowerBinId: -10, width: 5 });
    expect(data.slice(0, 8)).toEqual(Uint8Array.from(INITIALIZE_POSITION_DISCRIMINATOR));
    expect(i32At(data, 8)).toBe(-10);
    expect(i32At(data, 12)).toBe(5);
    const instruction = initializePositionInstruction(
      {
        payer: PAYER,
        position: POSITION,
        lbPair: PAIR,
        owner: PAYER,
        eventAuthority: EVENT,
      },
      { lowerBinId: -10, width: 5 },
    );
    expect(instruction.accounts).toHaveLength(8);
    expect(instruction.accounts[0]?.role).toBe(AccountRole.WRITABLE_SIGNER);
    expect(instruction.accounts[1]?.role).toBe(AccountRole.WRITABLE_SIGNER);
    expect(String(instruction.accounts[1]?.address)).toBe(POSITION);
    expect(instruction.accounts[3]?.role).toBe(AccountRole.READONLY_SIGNER);
    expect(String(instruction.accounts[3]?.address)).toBe(PAYER);
  });

  test("close_position2 names five accounts then the two coverage bin arrays", () => {
    expect(closeCoverageIndexes(70)).toEqual([1, 2]);
    expect(closeCoverageIndexes(-1)).toEqual([-1, 0]);
    const instruction = closePosition2Instruction({
      position: POSITION,
      sender: PAYER,
      rentReceiver: PAYER,
      eventAuthority: EVENT,
      binArrays: [ARRAY_LOWER, ARRAY_NEXT],
    });
    expect(instruction.data).toEqual(Uint8Array.from(CLOSE_POSITION2_DISCRIMINATOR));
    expect(instruction.accounts).toHaveLength(7);
    expect(String(instruction.accounts[0]?.address)).toBe(POSITION);
    expect(instruction.accounts[1]?.role).toBe(AccountRole.READONLY_SIGNER);
    expect(instruction.accounts[2]?.role).toBe(AccountRole.WRITABLE);
    expect(String(instruction.accounts[5]?.address)).toBe(ARRAY_LOWER);
    expect(instruction.accounts[5]?.role).toBe(AccountRole.WRITABLE);
    expect(String(instruction.accounts[6]?.address)).toBe(ARRAY_NEXT);
    expect(instruction.accounts[6]?.role).toBe(AccountRole.WRITABLE);
  });
});
