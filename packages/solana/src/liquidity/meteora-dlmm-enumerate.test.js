// @ts-check
/**
 * Owner scan seam, without Surfnet: the official memcmp filters, the shared candidate
 * bound, and a corrupt match that fails the whole enumeration instead of being dropped.
 */
import { describe, expect, test } from "bun:test";
import { getBase58Encoder, getBase64Decoder } from "@solana/kit";
import { Cause, Effect, Option } from "effect";
import { TOKEN_PROGRAM } from "../market/mint-account.js";
import { MAX_POSITION_CANDIDATES } from "./liquidity-enumerate-select.js";
import { listPositionsLive } from "./liquidity-enumerate.js";
import { randomAddress } from "./liquidity-seeds.js";
import { mintBytes } from "./liquidity-token-fixture.js";
import { binArrayAddress } from "./meteora-dlmm-bins.js";
import {
  meteoraBinArrayBytes,
  meteoraPairBytes,
  meteoraPositionBytes,
} from "./meteora-dlmm-bytes.js";
import { METEORA_DLMM_PROGRAM, POSITION_V2_DISCRIMINATOR } from "./meteora-dlmm-program.js";

const base64 = getBase64Decoder();
const base58Bytes = getBase58Encoder();

/**
 * @param {import("effect").Effect.Effect<unknown, unknown, never>} effect
 */
const run = (effect) =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (exit._tag === "Success") return exit.value;
    const failure = Cause.failureOption(exit.cause);
    if (Option.isNone(failure)) throw new Error(String(exit.cause));
    return /** @type {{ _tag?: string; reason?: string; positions?: unknown }} */ (failure.value);
  });

/**
 * @param {unknown[]} rows
 * @param {string[]} calls
 */
const scanningRead = (rows, calls) => ({
  rpc: {
    getProgramAccounts: (/** @type {string} */ program) => ({
      send: () => {
        calls.push("getProgramAccounts", program);
        return Promise.resolve(rows);
      },
    }),
    getAccountInfo: () => ({
      send: () => {
        calls.push("getAccountInfo");
        return Promise.resolve({ value: null });
      },
    }),
  },
  origin: "http://127.0.0.1",
  timeoutMs: 1000,
});

/**
 * @param {string} pubkey
 * @param {Uint8Array} bytes
 */
const gpaRow = (pubkey, bytes) => ({
  pubkey,
  account: {
    owner: METEORA_DLMM_PROGRAM,
    data: [base64.decode(bytes), "base64"],
  },
});

describe("meteora owner enumeration seam", () => {
  test("scans PositionV2 by discriminator and owner at offset 40, with no receipt mint", async () => {
    /** @type {unknown[]} */
    const seen = [];
    const owner = randomAddress();
    const read = {
      rpc: {
        getProgramAccounts: (/** @type {string} */ program, /** @type {any} */ config) => ({
          send: () => {
            seen.push(program, config);
            return Promise.resolve([]);
          },
        }),
      },
      origin: "http://127.0.0.1",
      timeoutMs: 1000,
    };
    const result = await run(
      listPositionsLive(/** @type {any} */ (read), { protocol: "meteora", owner }),
    );
    expect(result).toEqual({ positions: [], perpAccounts: [], receiptMints: [] });
    expect(seen[0]).toBe(METEORA_DLMM_PROGRAM);
    const filters = /** @type {{ filters: { memcmp: { offset: bigint; bytes: string } }[] }} */ (
      seen[1]
    ).filters;
    expect(filters.map((filter) => filter.memcmp.offset)).toEqual([0n, 40n]);
    expect([...base58Bytes.encode(filters[0]?.memcmp.bytes ?? "")]).toEqual([
      ...POSITION_V2_DISCRIMINATOR,
    ]);
    expect(filters[1]?.memcmp.bytes).toBe(owner);
  });

  test("more than 256 program accounts fails the enumeration before any decode", async () => {
    /** @type {string[]} */
    const calls = [];
    const read = scanningRead(Array.from({ length: MAX_POSITION_CANDIDATES + 1 }), calls);
    const result = await run(
      listPositionsLive(/** @type {any} */ (read), {
        protocol: "meteora",
        owner: randomAddress(),
      }),
    );
    expect(result).toMatchObject({
      _tag: "LiquidityEnumerationIncomplete",
      reason: "owner holds more than 256 candidate positions",
    });
    expect(calls).not.toContain("getAccountInfo");
  });

  test("one undecodable candidate fails the whole enumeration", async () => {
    const owner = randomAddress();
    const pair = randomAddress();
    /** @type {string[]} */
    const calls = [];
    const rows = [
      gpaRow(
        randomAddress(),
        meteoraPositionBytes({ lbPair: pair, owner, lowerBinId: 3, upperBinId: 1 }),
      ),
      gpaRow(
        randomAddress(),
        meteoraPositionBytes({ lbPair: pair, owner, lowerBinId: 0, upperBinId: 0 }),
      ),
    ];
    const result = await run(
      listPositionsLive(/** @type {any} */ (scanningRead(rows, calls)), {
        protocol: "meteora",
        owner,
      }),
    );
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      reason: "position bin window is inverted",
    });
    expect(result.positions).toBeUndefined();
    expect(calls).not.toContain("getAccountInfo");
  });

  test("shared pairs, bin arrays, and mints are fetched once", async () => {
    const owner = randomAddress();
    const pair = randomAddress();
    const mintX = randomAddress();
    const mintY = randomAddress();
    const first = randomAddress();
    const second = randomAddress();
    const binArray = await binArrayAddress(pair, 0);
    const positionBytes = meteoraPositionBytes({
      lbPair: pair,
      owner,
      lowerBinId: 0,
      upperBinId: 0,
      shares: [{ index: 0, share: 4n }],
    });
    /** @type {Map<string, { owner: string; bytes: Uint8Array }>} */
    const books = new Map([
      [pair, { owner: METEORA_DLMM_PROGRAM, bytes: meteoraPairBytes({ mintX, mintY }) }],
      [
        binArray,
        {
          owner: METEORA_DLMM_PROGRAM,
          bytes: meteoraBinArrayBytes({
            lbPair: pair,
            index: 0,
            bins: [{ binId: 0, amountX: 8n, amountY: 2n, supply: 4n }],
          }),
        },
      ],
      [mintX, { owner: TOKEN_PROGRAM, bytes: mintBytes(9) }],
      [mintY, { owner: TOKEN_PROGRAM, bytes: mintBytes(6) }],
    ]);
    /** @type {string[][]} */
    const batches = [];
    const read = {
      rpc: {
        getProgramAccounts: () => ({
          send: () =>
            Promise.resolve([gpaRow(first, positionBytes), gpaRow(second, positionBytes)]),
        }),
        getMultipleAccounts: (/** @type {readonly string[]} */ keys) => ({
          send: () => {
            const addresses = keys.map(String);
            batches.push(addresses);
            return Promise.resolve({
              value: addresses.map((key) => {
                const row = books.get(key);
                return row === undefined
                  ? null
                  : { owner: row.owner, data: [base64.decode(row.bytes), "base64"] };
              }),
            });
          },
        }),
      },
      origin: "http://127.0.0.1",
      timeoutMs: 1000,
    };
    const result = await run(
      listPositionsLive(/** @type {any} */ (read), { protocol: "meteora", owner }),
    );
    // Two serial layouts would read the pair, the bin array, and the mints twice (6 calls).
    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual([pair]);
    expect(batches[1]).toEqual([binArray]);
    expect(batches[2]?.toSorted((a, b) => a.localeCompare(b))).toEqual(
      [mintX, mintY].toSorted((a, b) => a.localeCompare(b)),
    );
    const listed =
      /** @type {{ position: string; liquidity: string; tokenA: { amount: string } }[]} */ (
        result.positions
      );
    expect(
      listed.map((position) => position.position).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual([first, second].toSorted((a, b) => a.localeCompare(b)));
    expect(listed.every((position) => position.liquidity === "4")).toBe(true);
    expect(listed.every((position) => position.tokenA.amount === "8")).toBe(true);
    expect(result.receiptMints).toEqual([]);
  });

  test("a missing shared pair fails the enumeration before bin or mint reads", async () => {
    const owner = randomAddress();
    const pair = randomAddress();
    const first = randomAddress();
    const bytes = meteoraPositionBytes({ lbPair: pair, owner, lowerBinId: 0, upperBinId: 0 });
    /** @type {string[][]} */
    const batches = [];
    const read = {
      rpc: {
        getProgramAccounts: () => ({
          send: () => Promise.resolve([gpaRow(first, bytes), gpaRow(randomAddress(), bytes)]),
        }),
        getMultipleAccounts: (/** @type {readonly string[]} */ keys) => ({
          send: () => {
            batches.push(keys.map(String));
            return Promise.resolve({ value: keys.map(() => null) });
          },
        }),
      },
      origin: "http://127.0.0.1",
      timeoutMs: 1000,
    };
    const result = await run(
      listPositionsLive(/** @type {any} */ (read), { protocol: "meteora", owner }),
    );
    expect(result).toMatchObject({
      _tag: "LiquidityPositionUnavailable",
      position: first,
      reason: "referenced pair is missing",
    });
    expect(batches).toEqual([[pair]]);
  });
});
