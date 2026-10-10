import { beforeAll, describe, expect, test } from "bun:test";
import {
  decompileTransactionMessage,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";
import { EventBus, EventBusInMemory, getBalances, sendSol, simulateSol } from "@solos/core";
import { Effect, Exit, Fiber, Layer, Option, Stream } from "effect";
import { SolanaTestLive } from "../index.js";
import { KitSigner } from "../signer/kit-signer.js";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { ensureSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";
import { transferFeeReserveLamports } from "./transfer-fee.js";
import { TRANSFER_V1_CONFIG } from "./transfer-sol.js";

describe("transfer through DirectSignerExecutor against Surfnet [integration]", () => {
  /** @type {Layer.Layer<any>} */
  let layer;
  /** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
  let surfnet;
  /** @type {string} */
  let sender;
  /** Fresh per run: the Surfnet is shared by every test file in the process. */
  /** @type {string} */
  let RECIPIENT;

  beforeAll(async () => {
    surfnet = await ensureSurfnet();
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

    const confirmed = await jsonRpc(surfnet.rpcUrl, "getTransaction", [
      receipt.signature,
      { commitment: "confirmed", encoding: "base64", maxSupportedTransactionVersion: 1 },
    ]);
    const wire = getBase64Encoder().encode(confirmed.transaction[0]);
    const transaction = getTransactionDecoder().decode(wire);
    expect(transaction.messageBytes[0]).toBe(0x81);
    const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    expect(compiled.version).toBe(1);
    expect("addressTableLookups" in compiled).toBe(false);
    expect(decompileTransactionMessage(compiled).config).toEqual(TRANSFER_V1_CONFIG);
    expect(BigInt(confirmed.meta.fee) <= transferFeeReserveLamports()).toBe(true);
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
