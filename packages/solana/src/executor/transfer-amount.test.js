import { beforeAll, describe, expect, test } from "bun:test";
import { EventBusInMemory, getBalances, sendSol, simulateSol } from "@solos/core";
import { Effect, Exit, Layer } from "effect";
import { SolanaTestLive } from "../index.js";
import { KitSigner } from "../signer/kit-signer.js";
import { ensureSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

/** @param {import("effect").Exit.Exit<unknown, unknown>} exit */
const failureText = (exit) => (Exit.isFailure(exit) ? JSON.stringify(exit.cause) : "");

describe("transfer amount boundary through DirectSignerExecutor against Surfnet [integration]", () => {
  /** @type {Layer.Layer<any>} */
  let layer;
  /** Fresh per run: the Surfnet is shared by every test file in the process. Funded so one-lamport transfers stay rent-exempt. */
  /** @type {string} */
  let RECIPIENT;

  beforeAll(async () => {
    const surfnet = await ensureSurfnet();
    RECIPIENT = await seedAddress(randomSeed());
    await surfnet.cheats.fundSol(RECIPIENT, 0.01);
    layer = Layer.merge(SolanaTestLive({ ...surfnet, seed: randomSeed() }), EventBusInMemory);
    const sender = await Effect.runPromise(
      Effect.map(KitSigner, (k) => k.signer.address).pipe(Effect.provide(layer)),
    );
    await surfnet.cheats.fundSol(sender, 0.1);
  });

  /**
   * @param {import("effect").Effect.Effect<unknown, unknown, unknown>} program
   * @returns {Promise<import("effect").Exit.Exit<unknown, unknown>>}
   */
  const exitOf = (program) => Effect.runPromiseExit(program.pipe(Effect.provide(layer)));

  test("normalizes numeric 1e-9 to exactly one lamport", async () => {
    const exit = await exitOf(simulateSol({ to: RECIPIENT, amountSol: 1e-9 }));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toMatchObject({ lamports: "1" });
  });

  test("simulates the decimal spelling of one lamport", async () => {
    const result = await Effect.runPromise(
      simulateSol({ to: RECIPIENT, amountSol: "0.000000001" }).pipe(Effect.provide(layer)),
    );
    expect(result).toMatchObject({ to: RECIPIENT, lamports: "1" });
  });

  test("rejects a zero simulate as a structured ValidationError", async () => {
    const exit = await exitOf(simulateSol({ to: RECIPIENT, amountSol: "0" }));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(failureText(exit)).toContain("ValidationError");
    expect(failureText(exit)).toContain("amountSol");
  });

  test("rejects a zero send before any execution and moves nothing", async () => {
    const balanceOf = () => Effect.runPromise(getBalances(RECIPIENT).pipe(Effect.provide(layer)));
    const before = await balanceOf();
    const exit = await exitOf(sendSol({ to: RECIPIENT, amountSol: "0", skipSimulation: true }));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(failureText(exit)).toContain("ValidationError");
    expect(await balanceOf()).toEqual(before);
  });
});
