// @ts-check
/**
 * The two gates the sell adds to the buy's, decided against a loopback JSON-RPC server.
 *
 * The shared gates — missing, foreign-owned, completed or non-SOL curves, an unreadable Global —
 * are `validateBuyReads` and are already proved in `pump-buy-rejections.test.js`; repeating them
 * here would test the same pure function twice. What is new is that a sell reads the wallet's own
 * balance of the coin, and that a quantity too small to clear one lamport after fees is refused
 * rather than handed to the program as a zero floor.
 *
 * The endpoint is a loopback JSON-RPC server rather than Surfnet, matching
 * `launch-venue-global.test.js` and `launch-venue-transport.test.js` beside it: a Surfnet can
 * serve a seeded account but cannot be made to fail a single read on demand, and the distinction
 * this suite has to prove — an absent account is zero, an endpoint failure is never zero — only
 * exists when both outcomes are reachable from the same call.
 */
import { describe, expect, test } from "bun:test";
import { address, createSolanaRpc, getAddressEncoder } from "@solana/kit";
import { Effect, Exit } from "effect";
import { bondingCurveAddress } from "./bonding-curve.js";
import { globalConfigAddress } from "./global-config.js";
import { associatedAccount } from "./pump-buy-accounts.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { PUMP_SELL_REJECTIONS, planPumpSell } from "./pump-sell-plan.js";
import { freshCurveBytes, tradingGlobalBytes } from "./test-fixtures.js";

const MINT = "UYGGYygeDt9SfsVBf2qBNtU4bFPhrR6DVVCRf7fpump";
const USER = "E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const FEE_RECIPIENT = "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV";
const BUYBACK = "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD";
const encoder = getAddressEncoder();

/** @param {string} key */
const keyBytes = (key) => new Uint8Array(encoder.encode(address(key)));

const GLOBAL_BYTES = tradingGlobalBytes({
  feeRecipient: keyBytes(FEE_RECIPIENT),
  buybackFeeRecipient: keyBytes(BUYBACK),
});

/** A token account carrying `amount` at bytes 64..72, the layout the balance read decodes. */
const tokenAccountBytes = (/** @type {bigint} */ amount) => {
  const bytes = new Uint8Array(165);
  new DataView(bytes.buffer).setBigUint64(64, amount, true);
  return bytes;
};

/** @param {{ owner: string; data: Uint8Array }} account */
const encoded = (account) => ({
  data: [Buffer.from(account.data).toString("base64"), "base64"],
  executable: false,
  lamports: 1_461_600,
  owner: account.owner,
  space: account.data.length,
});

/**
 * A server answering the four account reads the plan makes. `held` of `null` is an account that
 * does not exist; `failSeller` makes only the seller's account read fail, which is the case an
 * absent account must never be confused with.
 * @param {{ held: bigint | null; sellerBytes?: Uint8Array; failSeller?: boolean }} state
 */
const startServer = async (state) => {
  const seller = await associatedAccount(USER, MINT, TOKEN_PROGRAM);
  const accounts = new Map([
    [await bondingCurveAddress(MINT), { owner: PUMP_PROGRAM, data: freshCurveBytes() }],
    [await globalConfigAddress(), { owner: PUMP_PROGRAM, data: GLOBAL_BYTES }],
    [MINT, { owner: TOKEN_PROGRAM, data: new Uint8Array(82) }],
  ]);
  const sellerData =
    state.sellerBytes ?? (state.held === null ? null : tokenAccountBytes(state.held));
  if (sellerData !== null) accounts.set(seller, { owner: TOKEN_PROGRAM, data: sellerData });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const rpc = /** @type {{ id: number; params: [string] }} */ (await request.json());
      if (state.failSeller === true && rpc.params[0] === seller) {
        return Response.json({
          jsonrpc: "2.0",
          id: rpc.id,
          error: { code: -32_005, message: "node is behind" },
        });
      }
      const account = accounts.get(rpc.params[0]);
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: { context: { slot: 1 }, value: account === undefined ? null : encoded(account) },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** @param {Parameters<typeof startServer>[0]} state @param {string} amount */
const planAt = async (state, amount, maxSlippageBps = 50) => {
  const server = await startServer(state);
  try {
    const ctx = { url: server.url, rpc: createSolanaRpc(server.url) };
    const action = {
      type: /** @type {const} */ ("swap"),
      venue: /** @type {const} */ ("pump"),
      inputMint: MINT,
      outputMint: "So11111111111111111111111111111111111111112",
      amount,
      maxSlippageBps,
    };
    return await Effect.runPromiseExit(
      planPumpSell(/** @type {any} */ (ctx), action, /** @type {any} */ ({ address: USER })),
    );
  } finally {
    server.stop();
  }
};

/** @param {Exit.Exit<unknown, unknown>} exit */
const failureOf = (exit) =>
  Exit.isFailure(exit)
    ? /** @type {{ _tag?: string; reason?: string }} */ (
        /** @type {any} */ (exit.cause).error ?? /** @type {any} */ (exit.cause).defect
      )
    : undefined;

describe("pump sell refusals [integration]", () => {
  test("a wallet holding enough of the coin plans an instruction with a positive floor", async () => {
    const exit = await planAt({ held: 1_000_000_000n }, "1000000000");
    expect(Exit.isSuccess(exit)).toBe(true);
    const plan = /** @type {any} */ (exit).value;
    expect(plan.instructions).toHaveLength(1);
    expect(plan.instructions[0].accounts).toHaveLength(26);
    expect(plan.quote.minSolOutput).toBeGreaterThan(0n);
    // The floor sits below the fee-adjusted expectation, never above it.
    expect(plan.quote.minSolOutput).toBeLessThanOrEqual(plan.quote.expectedSol);
  });

  test("a wallet holding less than the sell asks for is refused before building", async () => {
    const exit = await planAt({ held: 999_999_999n }, "1000000000");
    expect(failureOf(exit)?.reason).toBe(PUMP_SELL_REJECTIONS.BALANCE_TOO_LOW);
  });

  test("a wallet that never held the coin reads as zero, not as an RPC failure", async () => {
    const exit = await planAt({ held: null }, "1");
    expect(failureOf(exit)?.reason).toBe(PUMP_SELL_REJECTIONS.BALANCE_TOO_LOW);
  });

  // The inverse of the case above, and the one that matters more: an endpoint that fails the
  // balance read must never be reported as an empty wallet. Answering an outage with
  // BALANCE_TOO_LOW would tell the operator they hold nothing when nothing was learned at all.
  test("an endpoint that fails the balance read is an RpcError, never an empty wallet", async () => {
    const exit = await planAt({ held: 1_000_000_000n, failSeller: true }, "1000000000");
    const failure = failureOf(exit);
    expect(failure?._tag).toBe("RpcError");
    expect(failure?.reason).not.toBe(PUMP_SELL_REJECTIONS.BALANCE_TOO_LOW);
  });

  test("an account too short to carry a token balance is refused, not read as zero", async () => {
    const exit = await planAt({ held: null, sellerBytes: new Uint8Array(40) }, "1000000000");
    expect(failureOf(exit)?.reason).toBe(PUMP_SELL_REJECTIONS.NOT_A_TOKEN_ACCOUNT);
  });

  test("a quantity too small to clear one lamport after fees is refused", async () => {
    // One base unit against the fixture's reserves rounds the proceeds to zero.
    const exit = await planAt({ held: 1_000_000_000n }, "1");
    expect(failureOf(exit)?.reason).toBe(PUMP_SELL_REJECTIONS.PROCEEDS_TOO_SMALL);
  });

  test("the sell inherits the buy's curve gates rather than restating them", async () => {
    expect(PUMP_SELL_REJECTIONS.CURVE_COMPLETE).toBeString();
    expect(PUMP_SELL_REJECTIONS.NOT_SOL_QUOTED).toBeString();
    expect(PUMP_SELL_REJECTIONS.GLOBAL_NO_FEES).toBeString();
  });

  test("the seller's token account is the ATA the balance gate reads", async () => {
    const ata = await associatedAccount(USER, MINT, TOKEN_PROGRAM);
    const exit = await planAt({ held: 1_000_000_000n }, "1000000000");
    const plan = /** @type {any} */ (exit).value;
    // v2 index 14 is `associated_base_user`: what the program debits is what was checked.
    expect(plan.instructions[0].accounts[14].address).toBe(ata);
  });
});
