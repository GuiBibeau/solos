// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getBase64Codec, getTransactionDecoder } from "@solana/kit";
import { EventBusInMemory, sendSol, simulateSol } from "@solos/core";
import { Effect, Layer } from "effect";
import { SolanaTestLive } from "../index.js";
import { KitSigner } from "../signer/kit-signer.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { ensureSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

/** @param {unknown} wire */
const signaturesOf = (wire) =>
  Object.values(
    getTransactionDecoder().decode(getBase64Codec().encode(/** @type {string} */ (wire)))
      .signatures,
  );

describe("the simulate tier hands the RPC nothing it could relay [integration]", () => {
  /** @type {Layer.Layer<any>} */
  let layer;
  /** @type {ReturnType<typeof startRpcRecorder>} */
  let recorder;
  /** @type {string} */
  let recipient;

  beforeAll(async () => {
    const surfnet = await ensureSurfnet();
    recorder = startRpcRecorder(surfnet.rpcUrl);
    recipient = await seedAddress(randomSeed());
    layer = Layer.merge(
      SolanaTestLive({ rpcUrl: recorder.url, wsUrl: surfnet.wsUrl, seed: randomSeed() }),
      EventBusInMemory,
    );
    const sender = await Effect.runPromise(
      Effect.map(KitSigner, (k) => k.signer.address).pipe(Effect.provide(layer)),
    );
    await surfnet.cheats.fundSol(sender, 1);
  });

  afterAll(() => recorder?.stop());

  test("a simulate-tier transfer reaches simulateTransaction with every signature zeroed", async () => {
    const before = recorder.callsFor("simulateTransaction").length;
    const result = await Effect.runPromise(
      simulateSol({ to: recipient, amountSol: "0.1", skipSimulation: false }).pipe(
        Effect.provide(layer),
      ),
    );
    expect(BigInt(result.unitsConsumed)).toBeGreaterThan(0n);
    const calls = recorder.callsFor("simulateTransaction").slice(before);
    expect(calls).toHaveLength(1);
    const params = /** @type {[unknown, { sigVerify?: boolean }]} */ (calls[0]?.params ?? []);
    const [wire, options] = params;
    expect(options.sigVerify).toBe(false);
    expect(signaturesOf(wire).every((signature) => signature === null)).toBe(true);
    expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
  });

  test("the execute tier still sends the signed bytes it simulated", async () => {
    const receipt = await Effect.runPromise(
      sendSol({ to: recipient, amountSol: "0.1", skipSimulation: false }).pipe(
        Effect.provide(layer),
      ),
    );
    expect(receipt.signature.length).toBeGreaterThan(60);
    const sent = recorder.callsFor("sendTransaction");
    expect(sent).toHaveLength(1);
    const signatures = signaturesOf(sent[0]?.params[0]);
    expect(signatures).toHaveLength(1);
    expect(signatures[0]).not.toBeNull();
  });
});
