// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  decompileTransactionMessage,
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getU64Codec,
} from "@solana/kit";
import { EventBusInMemory, executeSwap, TransactionFailed } from "@solos/core";
import { Effect, Layer } from "effect";
import { SolanaTestLive } from "../index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { ensureSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";
import {
  SWAP_COMPUTE_UNIT_LIMIT,
  SWAP_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
  SWAP_MAX_PRIORITY_FEE_LAMPORTS,
} from "../swap/jupiter-swap-build-assemble.js";
import {
  AMOUNT,
  INPUT_MINT,
  INPUT_VAULT,
  KEY,
  OUT_AMOUNT,
  OUTPUT_MINT,
  OUTPUT_VAULT,
  POOL_AUTHORITY,
} from "../swap/jupiter-swap-build-bodies.js";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { startBuildFixture } from "../swap/jupiter-swap-build-http-fixture.js";
import {
  ATA_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  JUP6_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
} from "../swap/jupiter-swap-build-validate.js";

/**
 * Wire proof for one real submission: `solos` executes an explicitly un-simulated swap against
 * Surfnet through the recording RPC proxy, the submission honestly fails on chain (no Jupiter
 * program offline), and the recorded wire decodes to the v1 transaction solOS assembled —
 * 0x81 version prefix, no lookup tables, the explicit local compute policy, the taker as fee
 * payer and only signer, no provider budget instruction, and the configured RPC's lifetime.
 */

const intent = { inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: AMOUNT, slippageBps: 50 };

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startBuildFixture>} */
let fixture;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** @type {string} */
let taker;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  // The preflight binds route token programs to each mint's on-chain owner, so both fixture
  // mints must exist on the offline fork with their real classic-token owner.
  await surfnet.cheats.ensureMint(INPUT_MINT, 9);
  await surfnet.cheats.ensureMint(OUTPUT_MINT, 6);
  fixture = startBuildFixture();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  const seed = randomSeed();
  taker = await seedAddress(seed);
  await surfnet.cheats.fundSol(taker, 1);
  const layer = Layer.merge(
    SolanaTestLive({
      rpcUrl: rpc.url,
      wsUrl: surfnet.wsUrl,
      seed,
      jupiter: { baseUrl: fixture.url, apiKey: KEY },
    }),
    EventBusInMemory,
  );
  const error = await failureOf(
    executeSwap({ ...intent, skipSimulation: true }).pipe(Effect.provide(layer)),
  );
  // The submission reaches the chain and fails honestly; BuildUnavailable would mean the
  // fixture was never consulted, so the wire below would not exist.
  if (!(error instanceof TransactionFailed)) throw new Error(`expected send: ${error}`);
});

afterAll(() => {
  fixture?.stop();
  rpc?.stop();
});

describe("the exact submitted swap wire [integration]", () => {
  test("is the assembled v1 transaction with the local policy and the taker alone", async () => {
    expect(rpc.callsFor("sendTransaction")).toHaveLength(1);
    const wire = getBase64Codec().encode(
      /** @type {string} */ (rpc.callsFor("sendTransaction")[0]?.params[0]),
    );
    expect(wire[0]).toBe(0x81);
    const transaction = getTransactionDecoder().decode(wire);
    const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    expect(compiled.version).toBe(1);
    expect("addressTableLookups" in compiled).toBe(false);
    expect(compiled.staticAccounts[0]).toBe(taker);
    expect(compiled.header.numSignerAccounts).toBe(1);
    expect(compiled.staticAccounts).not.toContain(COMPUTE_BUDGET_PROGRAM);
    const latest = /** @type {{ value: { blockhash: string; lastValidBlockHeight: bigint } }} */ (
      rpc.callsFor("getLatestBlockhash")[0]?.result
    );
    const decompiled = decompileTransactionMessage(
      /** @type {Parameters<typeof decompileTransactionMessage>[0]} */ (
        /** @type {unknown} */ (compiled)
      ),
      { lastValidBlockHeight: BigInt(latest.value.lastValidBlockHeight) },
    );
    expect(decompiled.config).toEqual({
      computeUnitLimit: SWAP_COMPUTE_UNIT_LIMIT,
      loadedAccountsDataSizeLimit: SWAP_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
      priorityFeeLamports: SWAP_MAX_PRIORITY_FEE_LAMPORTS,
    });
    // Pinned to the verified literal: the submitted wire carries the 16 MiB bound the real
    // Metis route simulation required.
    expect(decompiled.config?.loadedAccountsDataSizeLimit).toBe(16_777_216);
    expect(decompiled.lifetimeConstraint.blockhash).toBe(latest.value.blockhash);
    expect(decompiled.instructions.map((ix) => ix.programAddress)).toEqual([
      ATA_PROGRAM,
      ATA_PROGRAM,
      SYSTEM_PROGRAM,
      TOKEN_PROGRAM,
      JUP6_PROGRAM,
      TOKEN_PROGRAM,
    ]);
    const transfer = decompiled.instructions[2];
    const route = decompiled.instructions[4];
    if (!transfer || !route) throw new Error("submitted wire lacked the expected instructions");
    expect(getU64Codec().decode(transfer.data, 4)).toBe(BigInt(AMOUNT));
    expect(getU64Codec().decode(route.data, 8)).toBe(BigInt(AMOUNT));
    expect(getU64Codec().decode(route.data, 16)).toBe(BigInt(OUT_AMOUNT));
    // The temp wSOL create rides from the provider as idempotent and is pinned to exclusive
    // creation at assembly; the destination ATA keeps idempotent semantics. Fixture order:
    // destination create first, temp wSOL create second.
    expect(decompiled.instructions[1]?.data?.at(0)).toBe(0);
    expect(decompiled.instructions[0]?.data?.at(0)).toBe(1);
    expect(compiled.staticAccounts).toEqual(
      expect.arrayContaining([POOL_AUTHORITY, INPUT_VAULT, OUTPUT_VAULT]),
    );
  });
});
