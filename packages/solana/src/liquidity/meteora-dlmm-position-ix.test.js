// @ts-check
import { describe, expect, test } from "bun:test";
import { AccountRole } from "@solana/kit";
import {
  CLOSE_POSITION2_DISCRIMINATOR,
  INITIALIZE_POSITION_DISCRIMINATOR,
  closePosition2Instruction,
  initializePositionData,
  initializePositionInstruction,
} from "./meteora-dlmm-position-ix.js";

const PAYER = "11111111111111111111111111111111";
const POSITION = "So11111111111111111111111111111111111111112";
const PAIR = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const EVENT = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

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

  test("close_position2 has no arguments and five named accounts", () => {
    const instruction = closePosition2Instruction({
      position: POSITION,
      sender: PAYER,
      rentReceiver: PAYER,
      eventAuthority: EVENT,
    });
    expect(instruction.data).toEqual(Uint8Array.from(CLOSE_POSITION2_DISCRIMINATOR));
    expect(instruction.accounts).toHaveLength(5);
    expect(String(instruction.accounts[0]?.address)).toBe(POSITION);
    expect(instruction.accounts[1]?.role).toBe(AccountRole.READONLY_SIGNER);
    expect(instruction.accounts[2]?.role).toBe(AccountRole.WRITABLE);
  });
});
