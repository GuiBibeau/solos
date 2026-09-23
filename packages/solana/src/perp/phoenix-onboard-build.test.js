// @ts-check
import { afterEach, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { getBase58Decoder, getBase64Codec, getTransactionDecoder } from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { Effect, Exit } from "effect";
import { SolanaRpc, SolanaRpcLive } from "../rpc/solana-rpc.js";
import { ensureSurfnet } from "../surfnet/index.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { traderAddress } from "./perp-onboarder-live.js";
import { startPhoenixFixture } from "./phoenix-fixture.js";
import { buildOnboarding } from "./phoenix-onboard-build.js";
import { buildFor, fakeRpc } from "./phoenix-onboard-fixture.js";
import { executeEnrollment, simulateEnrollment } from "./phoenix-onboard-send.js";
import { assertPhoenixV0WireForSubmission } from "./phoenix-onboard-v0.js";

/** @type {ReturnType<typeof startPhoenixFixture> | undefined} */
let fixture;
afterEach(() => fixture?.stop());
test("Phoenix onboarding build [integration] signs only the wallet's official enrollment instructions", async () => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  const trader = await traderAddress(signer.address);
  fixture = startPhoenixFixture({ onboardBuild: buildFor(signer.address, trader) });
  const result = await Effect.runPromise(
    buildOnboarding({ baseUrl: fixture.url }, /** @type {any} */ (fakeRpc()), {
      backend: "memory",
      signer,
    }),
  );
  expect(result.owner).toBe(signer.address);
  expect(result.trader).toBe(trader);
  // The pinned Phoenix builder examples submit v0 (TS) or legacy (Rust), never v1.
  const wire = getBase64Codec().encode(result.wire);
  const decoded = getTransactionDecoder().decode(wire);
  expect(decoded.messageBytes[0]).toBe(0x80);
  const wrongVersion = Uint8Array.from(wire);
  wrongVersion[wire.length - decoded.messageBytes.length] = 0x81;
  expect(() => assertPhoenixV0WireForSubmission(getBase64Codec().decode(wrongVersion))).toThrow(
    BuildRejected,
  );
  expect(fixture.requests.map((request) => request.path)).toEqual([
    "/v1/exchange/build-register-ixs",
  ]);
});

test("Phoenix onboarding build [integration] rejects a provider that changes the trader before contacting RPC", async () => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  fixture = startPhoenixFixture({ onboardBuild: buildFor(signer.address, signer.address) });
  const result = await Effect.runPromiseExit(
    buildOnboarding({ baseUrl: fixture.url }, /** @type {any} */ (fakeRpc()), {
      backend: "memory",
      signer,
    }),
  );
  expect(Exit.isFailure(result)).toBe(true);
  expect(JSON.stringify(result)).toContain("BuildRejected");
  expect(fixture.requests).toHaveLength(1);
});

test("Phoenix onboarding build [integration] explains denied access without signing or sending", async () => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  fixture = startPhoenixFixture({ traderStatus: 404 });
  const exit = await Effect.runPromiseExit(
    buildOnboarding({ baseUrl: fixture.url }, /** @type {any} */ (fakeRpc()), {
      backend: "memory",
      signer,
    }),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  expect(JSON.stringify(exit)).toContain("request Phoenix trader access");
  expect(fixture.requests.map((request) => request.path)).toEqual([
    "/v1/exchange/build-register-ixs",
  ]);
});

test("Phoenix onboarding build [integration] rejects wrong programs, duplicate registration and redirected rent", async () => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  const trader = await traderAddress(signer.address);
  const original = buildFor(signer.address, trader);
  const wrongProgram = structuredClone(original);
  wrongProgram.instructions[0].programId = "11111111111111111111111111111111";
  const duplicate = structuredClone(original);
  duplicate.instructions.push(structuredClone(original.instructions[0]));
  const wrongPayer = structuredClone(original);
  wrongPayer.instructions[0].keys[3].pubkey = trader;
  for (const build of [wrongProgram, duplicate, wrongPayer]) {
    fixture = startPhoenixFixture({ onboardBuild: build });
    const exit = await Effect.runPromiseExit(
      buildOnboarding({ baseUrl: fixture.url }, /** @type {any} */ (fakeRpc()), {
        backend: "memory",
        signer,
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("BuildRejected");
    expect(fixture.requests.map((request) => request.path)).toEqual([
      "/v1/exchange/build-register-ixs",
    ]);
    fixture.stop();
  }
});

test("Phoenix onboarding [integration] submits a preflighted partially signed v0 wire once through the official API", async () => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  const trader = await traderAddress(signer.address);
  const build = buildFor(signer.address, trader);
  fixture = startPhoenixFixture({ onboardBuild: build });
  const rpc = fakeRpc().rpc;
  const ctx = {
    url: fixture.url,
    rpc: {
      ...rpc,
      getBlockHeight: () => ({ send: async () => 1n }),
      getBalance: () => ({ send: async () => ({ value: 2_000_000_000n }) }),
      simulateTransaction: () => ({
        send: async () => ({
          value: {
            err: null,
            logs: [],
            unitsConsumed: 123n,
            accounts: [{ lamports: 1_980_000_000n }],
          },
        }),
      }),
      getSignatureStatuses: () => ({
        send: async () => ({ value: [{ confirmationStatus: "confirmed", err: null }] }),
      }),
    },
  };
  const kit = { backend: "memory", signer };
  const planned = await Effect.runPromise(
    buildOnboarding({ baseUrl: fixture.url }, /** @type {any} */ (ctx), kit),
  );
  const expectedSignature = getBase58Decoder().decode(planned.signed.signatures[signer.address]);
  let submits = 0;
  let sentWire;
  const config = {
    baseUrl: fixture.url,
    fetchImpl: async (url, options) => {
      if (url.includes("send-register-ixs")) {
        submits += 1;
        const sent = JSON.parse(options?.body);
        sentWire = sent.transaction;
        if (
          getTransactionDecoder().decode(getBase64Codec().encode(sentWire)).messageBytes[0] !== 0x80
        )
          return Response.json({ error: "unsupported version" }, { status: 422 });
        return Response.json({ ...build, instructions: undefined, signature: expectedSignature });
      }
      return fetch(url, options);
    },
  };
  const action = {
    type: /** @type {const} */ ("onboard_perp"),
    traderPdaIndex: 0,
    traderSubaccountIndex: 0,
  };
  const simulation = await Effect.runPromise(
    simulateEnrollment({ config, ctx: /** @type {any} */ (ctx), kit }, action),
  );
  expect(simulation.venueQuote).toEqual({
    kind: "perp_onboard",
    estimatedSpendLamports: "20010000",
  });
  const result = await Effect.runPromise(
    executeEnrollment({ config, ctx: /** @type {any} */ (ctx), kit }, action),
  );
  expect(result.status).toBe("confirmed");
  expect(result.signature).toBe(expectedSignature);
  expect(submits).toBe(1);
  expect(sentWire).toBe(planned.wire);
});

test("Phoenix onboarding [integration] refuses a successful simulation without a wallet spend estimate", async () => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  fixture = startPhoenixFixture({
    onboardBuild: buildFor(signer.address, await traderAddress(signer.address)),
  });
  const ctx = {
    ...fakeRpc(),
    rpc: {
      ...fakeRpc().rpc,
      getBlockHeight: () => ({ send: async () => 1n }),
      getBalance: () => ({ send: async () => ({ value: 2_000_000_000n }) }),
      simulateTransaction: () => ({
        send: async () => ({ value: { err: null, logs: [], accounts: [null] } }),
      }),
    },
  };
  const exit = await Effect.runPromiseExit(
    executeEnrollment(
      {
        config: { baseUrl: fixture.url },
        ctx: /** @type {any} */ (ctx),
        kit: { backend: "memory", signer },
      },
      { type: "onboard_perp", traderPdaIndex: 0, traderSubaccountIndex: 0 },
    ),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  expect(JSON.stringify(exit)).toContain("wallet spend could not be estimated");
  expect(fixture.requests.map((request) => request.path)).not.toContain(
    "/v1/exchange/send-register-ixs",
  );
});

test("Phoenix onboarding [integration] refuses a failed Surfpool simulation with no provider submission", async () => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  fixture = startPhoenixFixture({
    onboardBuild: buildFor(signer.address, await traderAddress(signer.address)),
  });
  const surfnet = await ensureSurfnet();
  const run = (operation) =>
    Effect.flatMap(SolanaRpc, (ctx) =>
      operation(
        { config: { baseUrl: fixture.url }, ctx, kit: { backend: "memory", signer } },
        { type: "onboard_perp", traderPdaIndex: 0, traderSubaccountIndex: 0 },
      ),
    ).pipe(Effect.provide(SolanaRpcLive(surfnet.rpcUrl, surfnet.wsUrl)));
  const simulated = await Effect.runPromise(run(simulateEnrollment));
  expect(simulated.ok).toBe(false);
  const executed = await Effect.runPromiseExit(run(executeEnrollment));
  expect(Exit.isFailure(executed)).toBe(true);
  expect(fixture.requests.map((request) => request.path)).not.toContain(
    "/v1/exchange/send-register-ixs",
  );
});
