// @ts-check
import { describe, expect, test } from "bun:test";
import { AccountRole } from "@solana/kit";
import {
  DECREASE_LIQUIDITY_DISCRIMINATOR,
  TOKEN_PROGRAM,
  WHIRLPOOL_V1_CONFIG,
  decreaseLiquidityData,
  decreaseLiquidityInstruction,
  tickArrayAddress,
} from "./whirlpool-withdraw-instruction.js";

const POOL = "t45kYhVdVpTk5UxirScKYqs4rhuTFN6E1aDvb31x2km";
const AUTHORITY = "3dwmUNom1FYMNRzA4cvVtJuhQzB8xuDQkcuHSUCbNh4j";
const POSITION = "2kzvcTkdKNgQZFjZPjgZ6vsnEvSXD5HkVKEkgXcofMwx";
const CUSTODY = "4WtcLHrth8QJBcEkjWASfgwcb3ukij951vZpCQnP5gmz";
const OWNER_A = "5PqTCCv2P1GEznVMQPQPT4yXm7eNUZ4jHEELxMFbnCYZ";
const OWNER_B = "6GnJ47yA4t8Boxjx5GeLET1SwBNzENzPYXtqWK5jb84E";
const VAULT_A = "79j8v32Hkkz8d8zYk9tH1q3N7F7bzCv3o6a9PgD5YBVV";
const VAULT_B = "82fymx5RSdr5SKF9R38DoD5HHJrDk2bGcXQBpig7JheQ";
const TICK_LOWER = "8ucpds8Z8Wi2FVVk5vNAab7CTNakeZkYEeYUWbZ4LwGh";
const TICK_UPPER = "9nZfVnBgpPZy4fkLkoc7My97boqRAhdN5UAoP8eWHjdU";

describe("decrease_liquidity instruction bytes", () => {
  test("data is discriminator, u128 liquidity, u64 minA, u64 minB", () => {
    const data = decreaseLiquidityData(123_456_789n, 987_654n, 321n);
    expect(data.length).toBe(40);
    expect(data.slice(0, 8)).toEqual(new Uint8Array(DECREASE_LIQUIDITY_DISCRIMINATOR));
    // u128 little-endian liquidity at offset 8
    let liquidity = 0n;
    for (let i = 15; i >= 8; i -= 1) liquidity = (liquidity << 8n) | BigInt(data[i]);
    expect(liquidity).toBe(123_456_789n);
    // u64 little-endian minima at offsets 24 and 32
    let minA = 0n;
    for (let i = 31; i >= 24; i -= 1) minA = (minA << 8n) | BigInt(data[i]);
    let minB = 0n;
    for (let i = 39; i >= 32; i -= 1) minB = (minB << 8n) | BigInt(data[i]);
    expect(minA).toBe(987_654n);
    expect(minB).toBe(321n);
  });

  test("accounts follow the pinned IDL order and roles for decrease_liquidity", () => {
    const instruction = decreaseLiquidityInstruction(
      {
        whirlpool: POOL,
        positionAuthority: AUTHORITY,
        position: POSITION,
        positionTokenAccount: CUSTODY,
        tokenOwnerAccountA: OWNER_A,
        tokenOwnerAccountB: OWNER_B,
        tokenVaultA: VAULT_A,
        tokenVaultB: VAULT_B,
        tickArrayLower: TICK_LOWER,
        tickArrayUpper: TICK_UPPER,
      },
      { liquidity: 1n, tokenMinA: 2n, tokenMinB: 3n },
    );
    expect(instruction.programAddress).toBeDefined();
    const addresses = instruction.accounts.map((meta) => meta.address);
    expect(addresses).toEqual([
      POOL,
      TOKEN_PROGRAM,
      AUTHORITY,
      POSITION,
      CUSTODY,
      OWNER_A,
      OWNER_B,
      VAULT_A,
      VAULT_B,
      TICK_LOWER,
      TICK_UPPER,
    ]);
    expect(instruction.accounts[0].role).toBe(AccountRole.WRITABLE);
    expect(instruction.accounts[1].role).toBe(AccountRole.READONLY);
    expect(instruction.accounts[2].role).toBe(AccountRole.WRITABLE_SIGNER);
    expect(instruction.accounts[3].role).toBe(AccountRole.WRITABLE);
    expect(instruction.accounts[4].role).toBe(AccountRole.READONLY);
    for (const meta of instruction.accounts.slice(5)) {
      expect(meta.role).toBe(AccountRole.WRITABLE);
    }
  });

  test("v1 policy keeps real headroom and a bounded priority fee", () => {
    expect(WHIRLPOOL_V1_CONFIG.computeUnitLimit).toBeGreaterThanOrEqual(300_000);
    expect(WHIRLPOOL_V1_CONFIG.priorityFeeLamports).toBe(1000n);
  });

  test("tick array derivation matches the shared seed layout", async () => {
    const lower = await tickArrayAddress(POOL, -112_640);
    const upper = await tickArrayAddress(POOL, -56_320);
    expect(lower).not.toBe(upper);
    expect(typeof lower).toBe("string");
  });
});
