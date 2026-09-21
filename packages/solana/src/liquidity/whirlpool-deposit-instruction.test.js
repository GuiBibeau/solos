// @ts-check
import { describe, expect, test } from "bun:test";
import { getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";
import {
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getBase58Decoder,
  getBase64Codec,
  getBase64EncodedWireTransaction,
  getCompiledTransactionMessageDecoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
  getUtf8Encoder,
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { beginV1Message, signV1Message } from "../executor/transaction-v1.js";
import {
  DEPOSIT_V1_CONFIG,
  increaseLiquidityData,
  increaseLiquidityInstruction,
  tickArrayAddress,
} from "./whirlpool-deposit-instruction.js";
import { WHIRLPOOL_PROGRAM } from "./whirlpool-program.js";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/** The instruction's fixed 8-byte Anchor discriminator from the pinned IDL artifact. */
const DISCRIMINATOR = [46, 156, 243, 118, 13, 205, 251, 178];

const ACCOUNTS = {
  whirlpool: "t45kYhVdVpTk5UxirScKYqs4rhuTFN6E1aDvb31x2km",
  position: "2kzvcTkdKNgQZFjZPjgZ6vsnEvSXD5HkVKEkgXcofMwx",
  positionAuthority: "3dwmUNom1FYMNRzA4cvVtJuhQzB8xuDQkcuHSUCbNh4j",
  positionTokenAccount: "4WtcLHrth8QJBcEkjWASfgwcb3ukij951vZpCQnP5gmz",
  tokenOwnerAccountA: "5PqTCCv2P1GEznVMQPQPT4yXm7eNUZ4jHEELxMFbnCYZ",
  tokenOwnerAccountB: "6GnJ47yA4t8Boxjx5GeLET1SwBNzENzPYXtqWK5jb84E",
  tokenVaultA: "79j8v32Hkkz8d8zYk9tH1q3N7F7bzCv3o6a9PgD5YBVV",
  tokenVaultB: "82fymx5RSdr5SKF9R38DoD5HHJrDk2bGcXQBpig7JheQ",
  tickArrayLower: "8ucpds8Z8Wi2FVVk5vNAab7CTNakeZkYEeYUWbZ4LwGh",
  tickArrayUpper: "9nZfVnBgpPZy4fkLkoc7My97boqRAhdN5UAoP8eWHjdU",
};

describe("increase_liquidity instruction assembly", () => {
  test("the data is the discriminator plus u128 liquidity then u64 maxes, little-endian", () => {
    const data = increaseLiquidityData(0x01_02_03n, 1_000_005n, 999n);
    expect(DISCRIMINATOR.every((byte, i) => data[i] === byte)).toBe(true);
    const view = new DataView(data.buffer);
    expect(view.getBigUint64(8, true) | (view.getBigUint64(16, true) << 64n)).toBe(0x01_02_03n);
    expect(view.getBigUint64(24, true)).toBe(1_000_005n);
    expect(view.getBigUint64(32, true)).toBe(999n);
    expect(data.length).toBe(40);
  });

  test("accounts land in the pinned IDL order with the documented roles", () => {
    const ix = increaseLiquidityInstruction(ACCOUNTS, {
      liquidity: 1n,
      tokenMaxA: 2n,
      tokenMaxB: 3n,
    });
    expect(ix.programAddress).toBe(WHIRLPOOL_PROGRAM);
    expect(ix.accounts.map((a) => a.address)).toEqual([
      ACCOUNTS.whirlpool,
      TOKEN_PROGRAM,
      ACCOUNTS.positionAuthority,
      ACCOUNTS.position,
      ACCOUNTS.positionTokenAccount,
      ACCOUNTS.tokenOwnerAccountA,
      ACCOUNTS.tokenOwnerAccountB,
      ACCOUNTS.tokenVaultA,
      ACCOUNTS.tokenVaultB,
      ACCOUNTS.tickArrayLower,
      ACCOUNTS.tickArrayUpper,
    ]);
    // Roles: pool writable, token program readonly, authority writable signer, position
    // writable, its token account readonly, then owner accounts, vaults and tick arrays
    // all writable.
    expect(ix.accounts.map((a) => a.role)).toEqual([1, 0, 3, 1, 0, 1, 1, 1, 1, 1, 1]);
  });

  test("a decoded fixture transaction enforces the max spends and the venue accounts", async () => {
    const authority = await createKeyPairSignerFromPrivateKeyBytes(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const ix = increaseLiquidityInstruction(
      { ...ACCOUNTS, positionAuthority: authority.address },
      { liquidity: 123_456_789n, tokenMaxA: 500n, tokenMaxB: 600n },
    );
    const lifetime = {
      blockhash: getBase58Decoder().decode(crypto.getRandomValues(new Uint8Array(32))),
      lastValidBlockHeight: 999n,
    };
    const signed = await signV1Message(
      setTransactionMessageLifetimeUsingBlockhash(
        lifetime,
        appendTransactionMessageInstructions(
          [ix],
          beginV1Message({ feePayerSigner: authority, config: DEPOSIT_V1_CONFIG }),
        ),
      ),
    );
    // Decode the exact wire bytes that would reach RPC: version 1, one instruction.
    const wire = getBase64EncodedWireTransaction(signed);
    const transaction = getTransactionDecoder().decode(getBase64Codec().encode(wire));
    expect(transaction.messageBytes[0]).toBe(0x81); // v1 marker the submit gate enforces
    const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    const keys = compiled.staticAccounts;
    const header = compiled.instructionHeaders[0];
    const payload = compiled.instructionPayloads[0];
    expect(keys[header.programAccountIndex]).toBe(WHIRLPOOL_PROGRAM);
    // signer, pool, token program, position, ... every venue account present in order
    const resolved = payload.instructionAccountIndices.map((i) => keys[i]);
    expect(resolved).toContain(ACCOUNTS.whirlpool);
    expect(resolved).toContain(ACCOUNTS.position);
    expect(resolved).toContain(TOKEN_PROGRAM);
    expect(resolved).toContain(ACCOUNTS.positionTokenAccount);
    expect(resolved).toContain(ACCOUNTS.tokenOwnerAccountA);
    expect(resolved).toContain(ACCOUNTS.tokenOwnerAccountB);
    expect(resolved).toContain(ACCOUNTS.tokenVaultA);
    expect(resolved).toContain(ACCOUNTS.tokenVaultB);
    expect(resolved).toContain(ACCOUNTS.tickArrayLower);
    expect(resolved).toContain(ACCOUNTS.tickArrayUpper);
    // The budgets are encoded exactly as signed: max spend A = 500, max spend B = 600.
    const dataBytes = payload.instructionData;
    expect(DISCRIMINATOR.every((byte, i) => dataBytes[i] === byte)).toBe(true);
    const view = new DataView(dataBytes.buffer, dataBytes.byteOffset);
    expect(view.getBigUint64(8 + 16, true)).toBe(500n);
    expect(view.getBigUint64(8 + 24, true)).toBe(600n);
    expect(view.getBigUint64(8, true) | (view.getBigUint64(16, true) << 64n)).toBe(123_456_789n);
  });
});

describe("tick array derivation", () => {
  test("the PDA seeds are tick_array + pool + the decimal start tick", async () => {
    const derived = await tickArrayAddress(ACCOUNTS.whirlpool, -5632);
    const expected = await getProgramDerivedAddress({
      programAddress: WHIRLPOOL_PROGRAM,
      seeds: [
        getUtf8Encoder().encode("tick_array"),
        getAddressEncoder().encode(ACCOUNTS.whirlpool),
        getUtf8Encoder().encode("-5632"),
      ],
    });
    expect(derived).toBe(expected[0]);
  });

  test("start indexes match the pinned array math, including negatives", () => {
    const cases = [
      [-1000, 64, -5632],
      [1000, 64, 0],
      [0, 1, 0],
      [-1000, 1, -1056],
      [-887_272, 1, -887_304],
      [4199, 88, 0],
      [-4199, 88, -7744],
    ];
    for (const [tick, spacing, expected] of cases) {
      expect(getTickArrayStartTickIndex(tick, spacing)).toBe(expected);
    }
  });

  test("the deposit v1 config bounds compute units and fees before any signing", () => {
    expect(DEPOSIT_V1_CONFIG.computeUnitLimit).toBeGreaterThan(0);
    expect(DEPOSIT_V1_CONFIG.priorityFeeLamports).toBeGreaterThanOrEqual(0n);
    expect(DEPOSIT_V1_CONFIG.priorityFeeLamports).toBeLessThanOrEqual(100_000n);
    expect(DEPOSIT_V1_CONFIG.loadedAccountsDataSizeLimit).toBeGreaterThan(0);
  });
});
