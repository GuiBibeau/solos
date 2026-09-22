// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  address,
  decompileTransactionMessage,
  getAddressEncoder,
  getBase58Codec,
  getCompiledTransactionMessageDecoder,
} from "@solana/kit";
import {
  ActionExecutor,
  BuildRejected,
  executeLendDeposit,
  LendingInputInvalid,
  SimulationFailed,
  simulateLendDeposit,
} from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { KitSigner, SolanaRpc, SolanaTestLive } from "../index.js";
import {
  ensureOfflineSurfnet,
  randomSeed,
  seedAddress,
  surfnetCheatcodes,
  USDC_MINT,
} from "../surfnet/index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { TOKEN_PROGRAM } from "../wallet/parse-token-accounts.js";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";
import { vanillaObligationAddress } from "./kamino-deposit-addresses.js";
import { buildSignedLendDeposit } from "./kamino-deposit-build.js";
import {
  positionMarketBytes,
  positionObligationBytes,
  positionReserveBytes,
  seedKaminoAccount,
} from "./kamino-position-fixture.js";
import { sdkLendingMarketAuthority } from "./kamino-rpc-seam.js";

/**
 * The Kamino deposit twins through the real ActionExecutor over the offline Surfnet:
 * synthetic kLend market/reserve accounts are seeded with the `surfnet_setAccount`
 * cheatcode and the lending program is never meaningfully invoked — a simulation therefore
 * fails on chain, which is exactly the honest path under test: failed simulations send
 * nothing, rejected plans never even simulate, and the signed wire decodes to the exact
 * planned transaction.
 */

const addressEncoder = getAddressEncoder();

/** Reserve layout offset of `liquidity.tokenProgram` (pinned layout). */
const TOKEN_PROGRAM_OFFSET = 408;

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** @type {string} */
let market;
/** @type {string} */
let reserve;
/** @type {Uint8Array} */
let signerSeed;

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  signerSeed = randomSeed();
  reserve = await seedAddress(randomSeed());
  market = await seedAddress(randomSeed());
  // A distinct synthetic receipt mint so the collateral-mint row is a real classic mint.
  const receipt = getBase58Codec().decode(new Uint8Array(32).fill(7));
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  await seedKaminoAccount(surfnet.rpcUrl, market, positionMarketBytes());
  const reserveBytes = positionReserveBytes({
    market,
    mint: USDC_MINT,
    receiptMint: receipt,
    available: 10n ** 12n,
    collateralSupply: 10n ** 12n,
    decimals: 6,
  });
  // The fixture leaves the reserve's liquidity token program zeroed; pin the classic one.
  reserveBytes.set(addressEncoder.encode(address(TOKEN_PROGRAM)), TOKEN_PROGRAM_OFFSET);
  await seedKaminoAccount(surfnet.rpcUrl, reserve, reserveBytes);
  await cheats.ensureMint(USDC_MINT, 6);
  await cheats.setMint(receipt, 6);
  await cheats.setTokenAccount(await seedAddress(signerSeed), USDC_MINT, 10n ** 9n);
});

afterAll(() => {
  rpc.stop();
});

/** @type {(seed: Uint8Array) => import("effect").Layer.Layer<any>} */
const depositLayer = (seed) =>
  SolanaTestLive({
    rpcUrl: rpc.url,
    wsUrl: surfnet.wsUrl,
    seed,
    kamino: { market },
  });

const intent = (amount = "1000000") => ({ mint: USDC_MINT, amount });

/**
 * @param {Effect.Effect<unknown, unknown, never>} effect
 * @param {Uint8Array} seed
 * @returns {Promise<unknown>} the typed domain failure, or throws on unexpected defects
 */
const failureOfLocal = async (effect, seed) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, depositLayer(seed)));
  if (exit._tag !== "Failure") throw new Error("expected a domain failure");
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) throw new Error(`not a failure value: ${String(exit.cause)}`);
  return Option.getOrThrow(failure);
};

describe("kamino deposit executor against Surfnet [integration]", () => {
  test("a funded deposit simulates, fails honestly on the fork, and sends nothing", async () => {
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOfLocal(simulateLendDeposit(intent()), signerSeed);
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("the execute twin also refuses to send when its simulation fails", async () => {
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOfLocal(executeLendDeposit(intent()), signerSeed);
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("an insufficient balance is rejected before simulation", async () => {
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOfLocal(simulateLendDeposit(intent("999999999999")), signerSeed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("insufficient token balance");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("a mint the configured market has no reserve for is rejected before planning", async () => {
    const absentMint = await seedAddress(randomSeed());
    const failure = await failureOfLocal(
      simulateLendDeposit({ mint: absentMint, amount: "1" }),
      signerSeed,
    );
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("no float-rate reserve");
  });

  test("a malformed amount fails typed before the executor touches anything", async () => {
    const reads = rpc.callsFor("getMultipleAccounts").length;
    const failure = await failureOfLocal(
      simulateLendDeposit({ mint: USDC_MINT, amount: "0" }),
      signerSeed,
    );
    expect(failure).toBeInstanceOf(LendingInputInvalid);
    expect(rpc.callsFor("getMultipleAccounts").length).toBe(reads);
  });

  test("the executor revalidates the action's market against its configuration", async () => {
    const otherMarket = await seedAddress(randomSeed());
    const action = {
      type: /** @type {const} */ ("lend"),
      protocol: /** @type {const} */ ("kamino"),
      market: otherMarket,
      mint: USDC_MINT,
      amount: "1000000",
    };
    const program = Effect.flatMap(ActionExecutor, (executor) => executor.simulate(action));
    const failure = await failureOfLocal(program, signerSeed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("configured for");
  });

  test("the signed wire decodes to the planned exact-amount deposit", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.all([SolanaRpc, KitSigner]).pipe(
          Effect.flatMap(([ctx, kit]) =>
            buildSignedLendDeposit(
              { ctx, kit, market },
              { type: "lend", protocol: "kamino", market, mint: USDC_MINT, amount: "1000000" },
            ),
          ),
        ),
        depositLayer(signerSeed),
      ),
    );
    if (exit._tag !== "Success") {
      const f = Cause.failureOption(exit.cause);
      const reason = Option.isSome(f) ? JSON.stringify(Option.getOrThrow(f)) : "defect";
      throw new Error(`expected a signed build: ${reason}`);
    }
    const { signed, plan } = exit.value;
    expect(plan.quote.liquidityAmount).toBe("1000000");
    expect(plan.quote.initializeObligation).toBe(true);
    expect(plan.quote.rentLamports).not.toBe("0");
    const compiled = getCompiledTransactionMessageDecoder().decode(signed.messageBytes);
    const decoded = decompileTransactionMessage(compiled);
    // refreshReserve, initUserMetadata, initObligation, refreshObligation, deposit
    expect(decoded.instructions.length).toBe(5);
    for (const ix of decoded.instructions) {
      expect(ix.programAddress).toBe(KLEND_PROGRAM_ID);
    }
    // The combined deposit is last: discriminator + the exact u64 amount, little-endian.
    const deposit = decoded.instructions.at(-1);
    const data = /** @type {Uint8Array} */ (deposit?.data);
    expect(data.length).toBe(16);
    expect(new DataView(data.buffer, data.byteOffset).getBigUint64(8, true)).toBe(1_000_000n);
    // Authority, obligation and source selection: the market authority PDA is a read-only
    // custodian, the vanilla obligation PDA moves (writable) for the signer, funded from
    // the signer's own associated token account.
    const authority = await sdkLendingMarketAuthority(market);
    const metas = /** @type {{ accounts: { address: string; role: number }[] }} */ (deposit);
    expect(metas.accounts).toContainEqual({ address: authority, role: 0 });
    expect(metas.accounts).toContainEqual({
      address: await vanillaObligationAddress(await seedAddress(signerSeed), market),
      role: 1,
    });
    expect(metas.accounts).toContainEqual({ address: await seedAddress(signerSeed), role: 3 });
  });

  test("an on-chain obligation is decoded at the seam and the plan skips its init", async () => {
    const owner = await seedAddress(signerSeed);
    const obligation = await vanillaObligationAddress(owner, market);
    await seedKaminoAccount(
      surfnet.rpcUrl,
      obligation,
      positionObligationBytes({
        market,
        owner,
        deposits: [{ reserve, amount: 5n }],
      }),
    );
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.all([SolanaRpc, KitSigner]).pipe(
          Effect.flatMap(([ctx, kit]) =>
            buildSignedLendDeposit(
              { ctx, kit, market },
              { type: "lend", protocol: "kamino", market, mint: USDC_MINT, amount: "1000000" },
            ),
          ),
        ),
        depositLayer(signerSeed),
      ),
    );
    if (exit._tag !== "Success") {
      const f = Cause.failureOption(exit.cause);
      const reason = Option.isSome(f) ? JSON.stringify(Option.getOrThrow(f)) : "defect";
      throw new Error(`expected a signed build: ${reason}`);
    }
    const { signed, plan } = exit.value;
    // The obligation exists on chain with a nonzero deposit, so no obligation init and no
    // obligation rent; the user metadata is still absent and is initialized.
    expect(plan.quote.initializeObligation).toBe(false);
    expect(plan.quote.rentLamports).not.toBe("0");
    const compiled = getCompiledTransactionMessageDecoder().decode(signed.messageBytes);
    const decoded = decompileTransactionMessage(compiled);
    // refreshReserve, initUserMetadata, refreshObligation, deposit — no initObligation.
    expect(decoded.instructions.length).toBe(4);
    // The refresh carries the obligation's existing deposit reserve as a writable remaining.
    const refresh = decoded.instructions[2];
    const remaining = /** @type {{ accounts: { address: string; role: number }[] }} */ (
      refresh
    ).accounts.slice(2);
    expect(remaining.map((meta) => meta.address)).toContain(reserve);
    for (const meta of remaining) expect(meta.role).toBe(1);
  });
});
