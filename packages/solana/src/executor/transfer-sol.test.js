import { beforeAll, describe, expect, test } from "bun:test";
import { EventBus, EventBusInMemory, getBalances, sendSol, simulateSol } from "@solos/core";
import { Effect, Exit, Fiber, Layer, Option, Stream } from "effect";
import { SolanaTestLive } from "../index.js";
import { KitSigner } from "../signer/kit-signer.js";
import { ensureSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

describe("transfer through DirectSignerExecutor against Surfnet [integration]", () => {
  /** @type {Layer.Layer<any>} */
  let layer;
  /** @type {string} */
  let sender;
  /** Fresh per run: the Surfnet is shared by every test file in the process. */
  /** @type {string} */
  let RECIPIENT;

  beforeAll(async () => {
    const surfnet = await ensureSurfnet();
    RECIPIENT = await seedAddress(randomSeed());
    layer = Layer.merge(SolanaTestLive({ ...surfnet, seed: randomSeed() }), EventBusInMemory);
    sender = await Effect.runPromise(
      Effect.map(KitSigner, (k) => k.signer.address).pipe(Effect.provide(layer)),
    );
    await surfnet.cheats.fundSol(sender, 1);
  });

  test("simulates without moving funds", async () => {
    const result = await Effect.runPromise(
      simulateSol({ to: RECIPIENT, amountSol: "0.1", skipSimulation: false }).pipe(
        Effect.provide(layer),
      ),
    );
    expect(result).toMatchObject({ from: sender, to: RECIPIENT, lamports: "100000000" });
    expect(BigInt(result.unitsConsumed)).toBeGreaterThan(0n);
    const before = await Effect.runPromise(getBalances(RECIPIENT).pipe(Effect.provide(layer)));
    expect(before.lamports).toBe("0");
  });

  test("sends SOL, confirms, and publishes transfer.sent", async () => {
    const program = Effect.gen(function* () {
      const bus = yield* EventBus;
      const events = yield* bus.subscribe();
      const firstEvent = yield* Stream.runHead(events).pipe(Effect.forkScoped);
      const receipt = yield* sendSol({ to: RECIPIENT, amountSol: 0.25, skipSimulation: false });
      const event = yield* Fiber.join(firstEvent);
      return { receipt, event };
    }).pipe(Effect.scoped, Effect.provide(layer));

    const { receipt, event } = await Effect.runPromise(program);
    expect(receipt).toMatchObject({
      from: sender,
      to: RECIPIENT,
      lamports: "250000000",
      simulated: true,
    });
    expect(receipt.signature.length).toBeGreaterThan(60);
    expect(Option.isSome(event)).toBe(true);
    expect(Option.getOrThrow(event)).toMatchObject({ type: "transfer.sent", payload: receipt });

    const after = await Effect.runPromise(getBalances(RECIPIENT).pipe(Effect.provide(layer)));
    expect(after.lamports).toBe("250000000");
  });

  test("refuses to send more than the wallet holds, before any RPC send", async () => {
    const exit = await Effect.runPromiseExit(
      sendSol({ to: RECIPIENT, amountSol: 5, skipSimulation: true }).pipe(Effect.provide(layer)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const error = Exit.isFailure(exit) ? exit.cause : null;
    expect(JSON.stringify(error)).toContain("InsufficientFunds");
  });

  test("reserves the v1 priority fee before signing", async () => {
    const seed = randomSeed();
    const exactSender = await seedAddress(seed);
    const surfnet = await ensureSurfnet();
    await surfnet.cheats.fundSol(exactSender, 1);
    const exactLayer = Layer.merge(SolanaTestLive({ ...surfnet, seed }), EventBusInMemory);
    const exit = await Effect.runPromiseExit(
      sendSol({ to: RECIPIENT, amountSol: "0.9999945", skipSimulation: true }).pipe(
        Effect.provide(exactLayer),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("InsufficientFunds");
    expect(JSON.stringify(exit)).toContain("1000000500");
  });
});
