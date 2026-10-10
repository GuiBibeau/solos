// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ActionExecutor } from "@solos/core";
import { EngineExecutor } from "@solos/solana";
import { jsonRpc, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { Cause, Effect, Exit, Option } from "effect";
import { engineFetch, startTestEngine } from "./engine-fixture.js";

/** @typedef {import("@solos-sh/actions").Action} Action */
/** @typedef {Awaited<ReturnType<typeof startTestEngine>>} TestEngine */

/** @type {TestEngine | undefined} */
let engine;

const current = () => {
  if (engine === undefined) throw new Error("engine did not start");
  return engine;
};

/**
 * @param {{ url: string; token: string }} endpoint
 * @param {Action} action
 * @param {{ skipSimulation: boolean; intentId?: string }} options
 */
const executeExit = (endpoint, action, options) =>
  Effect.runPromise(
    Effect.exit(
      Effect.flatMap(ActionExecutor, (executor) => executor.execute(action, options)),
    ).pipe(Effect.provide(EngineExecutor(endpoint))),
  );

/** @param {import("effect/Exit").Exit<unknown, unknown>} exit */
const failureTag = (exit) => {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure) || failure.value === null || typeof failure.value !== "object") {
    return undefined;
  }
  return "_tag" in failure.value ? String(failure.value._tag) : undefined;
};

/** @param {string} rpcUrl @param {string} address */
const signaturesOf = async (rpcUrl, address) => {
  const rows = await jsonRpc(rpcUrl, "getSignaturesForAddress", [address, { limit: 1000 }]);
  return /** @type {Array<{ signature: string }>} */ (rows).map((row) => row.signature);
};

/**
 * @param {string} rpcUrl
 * @param {string} address
 * @param {string} signature
 */
const waitForSignature = async (rpcUrl, address, signature) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const found = await signaturesOf(rpcUrl, address);
    if (found.includes(signature)) return found;
    await Bun.sleep(400);
  }
  throw new Error("signature was not visible on the surfpool rpc");
};

/** @param {string} to @param {string} lamports */
const transfer = (to, lamports) => /** @type {Action} */ ({ type: "transfer_sol", to, lamports });

describe("engine execute through the ActionExecutor port [integration]", () => {
  /** @type {string} */
  let recipient;

  beforeAll(async () => {
    engine = await startTestEngine({ tier: "execute", allowedMints: [] });
    recipient = await seedAddress(randomSeed());
  });

  afterAll(async () => {
    await engine?.stop();
  });

  test("a transfer lands once and the same intent replays that signature", async () => {
    const running = current();
    const intentId = crypto.randomUUID();
    const before = await signaturesOf(running.surfnet.rpcUrl, running.signer);
    const first = await executeExit(running, transfer(recipient, "1000000"), {
      skipSimulation: false,
      intentId,
    });
    expect(Exit.isSuccess(first)).toBe(true);
    if (!Exit.isSuccess(first)) return;
    expect(first.value.status).toBe("confirmed");
    const signature = first.value.signature;
    expect(signature).toBeString();
    const seen = await waitForSignature(running.surfnet.rpcUrl, running.signer, String(signature));
    expect(seen.length).toBe(before.length + 1);

    const second = await executeExit(running, transfer(recipient, "1000000"), {
      skipSimulation: false,
      intentId,
    });
    expect(Exit.isSuccess(second)).toBe(true);
    if (!Exit.isSuccess(second)) return;
    expect(second.value.signature).toBe(signature);
    const after = await signaturesOf(running.surfnet.rpcUrl, running.signer);
    expect(after).toEqual(seen);

    const stored = await engineFetch(running, `/v1/intents/${intentId}`);
    expect(stored.status).toBe(200);
    expect(stored.body.state).toBe("settled");
    expect(stored.body.result.signature).toBe(signature);
  }, 120_000);

  test("two concurrent executes of one intent yield one success and one 409", async () => {
    const running = current();
    const intentId = crypto.randomUUID();
    const action = transfer(recipient, "1000000");
    const [left, right] = await Promise.all([
      executeExit(running, action, { skipSimulation: false, intentId }),
      executeExit(running, action, { skipSimulation: false, intentId }),
    ]);
    const tags = [failureTag(left), failureTag(right)].filter((tag) => tag !== undefined);
    const wins = [left, right].filter((exit) => Exit.isSuccess(exit));
    expect(wins).toHaveLength(1);
    expect(tags).toEqual(["IntentInFlight"]);
  }, 120_000);

  test("a failed execution is stored and the repeat returns the same error", async () => {
    const running = current();
    const intentId = crypto.randomUUID();
    const before = await signaturesOf(running.surfnet.rpcUrl, running.signer);
    const action = transfer(recipient, "1000000000000");
    const first = await executeExit(running, action, { skipSimulation: false, intentId });
    expect(failureTag(first)).toBe("SimulationFailed");
    const second = await executeExit(running, action, { skipSimulation: false, intentId });
    expect(failureTag(second)).toBe("SimulationFailed");
    expect(await signaturesOf(running.surfnet.rpcUrl, running.signer)).toEqual(before);
    const stored = await engineFetch(running, `/v1/intents/${intentId}`);
    expect(stored.body.state).toBe("failed");
    expect(stored.body.error.code).toBe("SimulationFailed");
  }, 120_000);

  test("a wrong bearer becomes EngineUnauthorized", async () => {
    const running = current();
    const exit = await executeExit(
      { url: running.url, token: "wrong-token" },
      transfer(recipient, "1000000"),
      { skipSimulation: false, intentId: crypto.randomUUID() },
    );
    expect(failureTag(exit)).toBe("EngineUnauthorized");
  });
});
