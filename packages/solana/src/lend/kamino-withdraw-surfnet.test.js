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
  executeLendWithdraw,
  LendingInputInvalid,
  simulateLendWithdraw,
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
import {
  positionMarketBytes,
  positionObligationBytes,
  positionReserveBytes,
  seedKaminoAccount,
} from "./kamino-position-fixture.js";
import { buildSignedLendWithdraw } from "./kamino-withdraw-build.js";

let surfnet;
let rpc;
let market;
let reserve;
let seed;
let receipt;
const mint = USDC_MINT;

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  seed = randomSeed();
  market = await seedAddress(randomSeed());
  reserve = await seedAddress(randomSeed());
  const owner = await seedAddress(seed);
  receipt = getBase58Codec().decode(new Uint8Array(32).fill(7));
  await seedKaminoAccount(surfnet.rpcUrl, market, positionMarketBytes());
  const reserveBytes = positionReserveBytes({
    market,
    mint,
    receiptMint: receipt,
    available: 10n ** 12n,
    collateralSupply: 10n ** 12n,
    decimals: 6,
  });
  reserveBytes.set(getAddressEncoder().encode(address(TOKEN_PROGRAM)), 408);
  await seedKaminoAccount(surfnet.rpcUrl, reserve, reserveBytes);
  await surfnetCheatcodes(surfnet.rpcUrl).ensureMint(mint, 6);
  await surfnetCheatcodes(surfnet.rpcUrl).setMint(receipt, 6);
  await surfnetCheatcodes(surfnet.rpcUrl).setTokenAccount(owner, mint, 0n);
  await seedKaminoAccount(
    surfnet.rpcUrl,
    await vanillaObligationAddress(owner, market),
    positionObligationBytes({ market, owner, deposits: [{ reserve, amount: 2_000_000n }] }),
  );
});

afterAll(() => rpc.stop());
const layer = () =>
  SolanaTestLive({ rpcUrl: rpc.url, wsUrl: surfnet.wsUrl, seed, kamino: { market } });

/** @param {bigint} available */
const setReserveLiquidity = async (available) => {
  const bytes = positionReserveBytes({
    market,
    mint,
    receiptMint: receipt,
    available,
    collateralSupply: 10n ** 12n,
    decimals: 6,
  });
  bytes.set(getAddressEncoder().encode(address(TOKEN_PROGRAM)), 408);
  await seedKaminoAccount(surfnet.rpcUrl, reserve, bytes);
};

/** @param {string} owner @param {bigint} amount @param {string} [borrowReserve] */
const setObligation = async (owner, amount, borrowReserve) => {
  const signer = await seedAddress(seed);
  await seedKaminoAccount(
    surfnet.rpcUrl,
    await vanillaObligationAddress(signer, market),
    positionObligationBytes({ market, owner, deposits: [{ reserve, amount }], borrowReserve }),
  );
};

/** @param {import("effect").Effect.Effect<unknown, unknown, never>} effect */
const failureOf = async (effect) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer()));
  if (exit._tag !== "Failure") throw new Error("expected failure");
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) throw new Error("unexpected defect");
  return failure.value;
};

describe("Kamino withdrawal over offline Surfnet [integration]", () => {
  test("builds a real collateral redemption directed to the signer's underlying ATA", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.all([SolanaRpc, KitSigner]).pipe(
          Effect.flatMap(([ctx, kit]) =>
            buildSignedLendWithdraw(
              { ctx, kit, market },
              { type: "withdraw_lend", protocol: "kamino", market, mint, amount: "1000000" },
            ),
          ),
        ),
        layer(),
      ),
    );
    if (exit._tag !== "Success") throw new Error(`expected build success: ${String(exit.cause)}`);
    const { signed, plan } = exit.value;
    expect(plan.quote.requestedLiquidity).toBe("1000000");
    expect(plan.quote.estimatedLiquidity).toBe("1000000");
    const decoded = decompileTransactionMessage(
      getCompiledTransactionMessageDecoder().decode(signed.messageBytes),
    );
    expect(decoded.instructions.map((ix) => ix.programAddress)).toEqual([
      KLEND_PROGRAM_ID,
      KLEND_PROGRAM_ID,
      KLEND_PROGRAM_ID,
    ]);
    const withdraw = decoded.instructions.at(-1);
    const data = /** @type {Uint8Array} */ (withdraw?.data);
    expect(new DataView(data.buffer, data.byteOffset).getBigUint64(8, true)).toBe(1_000_000n);
    const metas = /** @type {{ accounts: { address: string; role: number }[] }} */ (withdraw);
    expect(metas.accounts[9].address).toBe(plan.destination);
  });

  test("invalid base-unit input and a foreign configured market send nothing", async () => {
    const sends = rpc.callsFor("sendTransaction").length;
    expect(await failureOf(executeLendWithdraw({ mint, amount: "0" }))).toBeInstanceOf(
      LendingInputInvalid,
    );
    const other = await seedAddress(randomSeed());
    const program = Effect.flatMap(ActionExecutor, (executor) =>
      executor.simulate({
        type: "withdraw_lend",
        protocol: "kamino",
        market: other,
        mint,
        amount: "1",
      }),
    );
    expect(await failureOf(program)).toBeInstanceOf(BuildRejected);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("a request above the position fails before simulation or send", async () => {
    const sims = rpc.callsFor("simulateTransaction").length;
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOf(executeLendWithdraw({ mint, amount: "3000000" }));
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("no reserve liquidity and zero position fail before simulation", async () => {
    const sims = rpc.callsFor("simulateTransaction").length;
    const signer = await seedAddress(seed);
    try {
      await setReserveLiquidity(0n);
      expect(await failureOf(simulateLendWithdraw({ mint, amount: "1" }))).toBeInstanceOf(
        BuildRejected,
      );
      await setReserveLiquidity(10n ** 12n);
      await setObligation(signer, 0n);
      expect(await failureOf(simulateLendWithdraw({ mint, amount: "1" }))).toBeInstanceOf(
        BuildRejected,
      );
      expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
    } finally {
      await setReserveLiquidity(10n ** 12n);
      await setObligation(signer, 2_000_000n);
    }
  });

  test("foreign owner and borrowing obligations cannot withdraw", async () => {
    const signer = await seedAddress(seed);
    try {
      await setObligation(await seedAddress(randomSeed()), 2_000_000n);
      expect(await failureOf(executeLendWithdraw({ mint, amount: "1" }))).toBeInstanceOf(
        BuildRejected,
      );
      await setObligation(signer, 2_000_000n, reserve);
      expect(await failureOf(executeLendWithdraw({ mint, amount: "1" }))).toBeInstanceOf(
        BuildRejected,
      );
    } finally {
      await setObligation(signer, 2_000_000n);
    }
  });

  test("an obligation with another active reserve is rejected before sending", async () => {
    const signer = await seedAddress(seed);
    const other = await seedAddress(randomSeed());
    const sends = rpc.callsFor("sendTransaction").length;
    try {
      await seedKaminoAccount(
        surfnet.rpcUrl,
        await vanillaObligationAddress(signer, market),
        positionObligationBytes({
          market,
          owner: signer,
          deposits: [
            { reserve, amount: 2_000_000n },
            { reserve: other, amount: 10n },
          ],
        }),
      );
      const failure = await failureOf(executeLendWithdraw({ mint, amount: "1000000" }));
      expect(failure).toBeInstanceOf(BuildRejected);
      expect(/** @type {BuildRejected} */ (failure).reason).toContain("other active reserves");
      expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    } finally {
      await setObligation(signer, 2_000_000n);
    }
  });

  test("failed protocol simulation cannot submit", async () => {
    const sends = rpc.callsFor("sendTransaction").length;
    await failureOf(simulateLendWithdraw({ mint, amount: "1000000" }));
    await failureOf(executeLendWithdraw({ mint, amount: "1000000" }));
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });
});
