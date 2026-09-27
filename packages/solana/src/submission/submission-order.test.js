// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  BuildRejected,
  SimulationFailed,
  TransactionExpired,
  TransactionFailed,
} from "@solos/core";
import { Effect } from "effect";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { MAY_HAVE_LANDED } from "./confirm.js";
import { EXPIRED_AFTER_SIGNING } from "./lifetime.js";
import { SLOW } from "./mode.js";
import {
  ALWAYS,
  LAST_VALID,
  SEAL,
  SKIP,
  mark,
  prepare,
  startNode,
  stopNodes,
} from "./scripted-node-fixture.js";
import { simulateDraft, submitDraft } from "./submission.js";

afterEach(stopNodes);

describe("Submission runs one order of steps through the RPC Submitter [integration]", () => {
  test("slow: seal, lifetime, simulate, lifetime, send, confirm", async () => {
    const node = startNode();
    const { draft, deps } = await prepare(node);
    const delivered = await Effect.runPromise(submitDraft(deps, { draft }, ALWAYS));
    expect(node.calls).toEqual([
      ...SEAL,
      "getBlockHeight",
      "simulateTransaction",
      "getBlockHeight",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
    expect(delivered.simulated).toBe(true);
    expect(delivered.signature.length).toBeGreaterThan(60);
  });

  test("an explicit skip leaves one lifetime check after sealing, right before the send", async () => {
    const node = startNode();
    const { draft, deps } = await prepare(node);
    const delivered = await Effect.runPromise(submitDraft(deps, { draft }, SKIP));
    expect(node.calls).toEqual([
      ...SEAL,
      "getBlockHeight",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
    expect(delivered.simulated).toBe(false);
  });

  test("a venue that requires simulation keeps it through a Caller's skip", async () => {
    const node = startNode();
    const { draft, deps } = await prepare(node);
    const request = { draft, requireSimulation: true };
    const delivered = await Effect.runPromise(submitDraft(deps, request, SKIP));
    expect(node.calls.slice(0, 5)).toEqual([
      ...SEAL,
      "getBlockHeight",
      "simulateTransaction",
      "getBlockHeight",
    ]);
    expect(delivered.simulated).toBe(true);
  });

  test("the venue guard runs after simulation, and its refusal sends nothing", async () => {
    const node = startNode();
    const { draft, deps } = await prepare(node);
    const guard = Effect.zipRight(
      mark(node.calls, "guard"),
      Effect.fail(new BuildRejected({ reason: "venue moved" })),
    );
    const error = await failureOf(submitDraft(deps, { draft, guard }, ALWAYS));
    expect(error).toBeInstanceOf(BuildRejected);
    expect(node.calls).toEqual([...SEAL, "getBlockHeight", "simulateTransaction", "guard"]);
  });

  test("a guard without simulation still gets a lifetime check after it", async () => {
    const node = startNode();
    const { draft, deps } = await prepare(node);
    const guard = mark(node.calls, "guard");
    await Effect.runPromise(submitDraft(deps, { draft, guard }, SKIP));
    expect(node.calls.slice(0, 6)).toEqual([
      ...SEAL,
      "getBlockHeight",
      "guard",
      "getBlockHeight",
      "sendTransaction",
    ]);
  });

  test("expiry after a clean simulation is TransactionExpired with zero sends", async () => {
    const node = startNode({ heights: [100, 100, LAST_VALID + 1] });
    const { draft, deps } = await prepare(node);
    const error = await failureOf(submitDraft(deps, { draft }, ALWAYS));
    expect(error).toBeInstanceOf(TransactionExpired);
    expect(/** @type {TransactionExpired} */ (error).reason).toBe(EXPIRED_AFTER_SIGNING);
    expect(/** @type {TransactionExpired} */ (error).signature).toBeTruthy();
    expect(node.calls).not.toContain("sendTransaction");
  });

  test("the last valid height is still live", async () => {
    const node = startNode({ heights: [LAST_VALID, LAST_VALID, LAST_VALID] });
    const { draft, deps } = await prepare(node);
    await Effect.runPromise(submitDraft(deps, { draft }, ALWAYS));
    expect(node.calls).toContain("sendTransaction");
  });

  test("a failed simulation refuses the send and is reported by the simulate tier", async () => {
    const node = startNode({ simErr: { InstructionError: [0, { Custom: 1 }] } });
    const { draft, deps } = await prepare(node);
    const error = await failureOf(submitDraft(deps, { draft }, ALWAYS));
    expect(error).toBeInstanceOf(SimulationFailed);
    expect(node.calls).not.toContain("sendTransaction");
    const simulated = await Effect.runPromise(simulateDraft(deps, { draft }));
    expect(simulated.err).not.toBeNull();
    expect(simulated.logs).toEqual(["log"]);
  });

  test("a probe reads strictly before simulating, observes its accounts, and can refuse", async () => {
    const node = startNode();
    const { draft, deps } = await prepare(node);
    const watched = (await createMemorySignerFromBytes(randomSeed())).address;
    const probe = {
      accounts: [watched],
      before: Effect.as(mark(node.calls, "before"), 5n),
      verdict: (/** @type {unknown} */ _outcome, /** @type {unknown} */ before) =>
        Effect.fail(new SimulationFailed({ reason: `bounded at ${before}`, logs: [] })),
    };
    const error = await failureOf(submitDraft(deps, { draft, probe }, ALWAYS));
    expect(/** @type {SimulationFailed} */ (error).reason).toBe("bounded at 5");
    expect(node.calls).toEqual([...SEAL, "getBlockHeight", "before", "simulateTransaction"]);
    expect(JSON.stringify(node.params[3])).toContain(watched);
  });

  test("the simulate tier keeps the probe's verdict", async () => {
    const node = startNode();
    const { draft, deps } = await prepare(node);
    const probe = { verdict: () => Effect.succeed({ quoted: true }) };
    const simulated = await Effect.runPromise(simulateDraft(deps, { draft, probe }));
    expect(simulated.verdict).toEqual({ quoted: true });
    expect(node.calls).toEqual([...SEAL, "getBlockHeight", "simulateTransaction"]);
  });

  test("a mode without rechecks fetches a lifetime but never reads the block height", async () => {
    const mode = { ...SLOW, name: "unchecked", lifetime: { ...SLOW.lifetime, recheck: false } };
    const node = startNode();
    const { draft, deps } = await prepare(node, mode);
    await Effect.runPromise(submitDraft(deps, { draft }, ALWAYS));
    expect(node.calls).toEqual([
      "getLatestBlockhash",
      "simulateTransaction",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
  });

  test("a finalized confirmation keeps polling past a confirmed row", async () => {
    const confirmation = {
      commitment: /** @type {const} */ ("finalized"),
      deadlineMs: 5000,
      pollMs: 5,
    };
    const node = startNode({ statuses: ["confirmed", "finalized"] });
    const { draft, deps } = await prepare(node, { ...SLOW, name: "final", confirmation });
    await Effect.runPromise(submitDraft(deps, { draft }, SKIP));
    expect(node.calls.filter((call) => call === "getSignatureStatuses")).toHaveLength(2);
  });
  test("a refused send the node cannot report on is may-have-landed, with its signature", async () => {
    const node = startNode({ failSend: true, statusResult: null });
    const { draft, deps } = await prepare(node);
    const started = Date.now();
    const error = await failureOf(submitDraft(deps, { draft }, SKIP));
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(/** @type {TransactionFailed} */ (error).reason).toBe(MAY_HAVE_LANDED);
    expect(/** @type {TransactionFailed} */ (error).signature).toBeTruthy();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(node.calls).toEqual([
      ...SEAL,
      "getBlockHeight",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
  });

  test("a Submitter defect after the send still reports the signature", async () => {
    const node = startNode();
    const { draft, deps } = await prepare(node);
    const submitter = { ...deps.submitter, status: () => Effect.die(new Error("adapter bug")) };
    const error = await failureOf(submitDraft({ ...deps, submitter }, { draft }, SKIP));
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(/** @type {TransactionFailed} */ (error).reason).toBe(MAY_HAVE_LANDED);
    expect(/** @type {TransactionFailed} */ (error).signature).toBeTruthy();
  });
});
