// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  decompileTransactionMessage,
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  lamports as asLamports,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { BuildRejected, SignerUnavailable, TransactionExpired } from "@solos/core";
import { Effect } from "effect";
import { transferDraft } from "../executor/transfer-sol.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { SLOW } from "./mode.js";
import {
  ALWAYS,
  LAST_VALID,
  SEAL,
  prepare,
  startNode,
  stopNodes,
} from "./scripted-node-fixture.js";
import { EXPIRED_BEFORE_SIGNING, SIGNER_FAILED, sealDraft } from "./seal-draft.js";
import { submitDraft } from "./submission.js";

afterEach(stopNodes);

/** A signer that records whether it was ever asked to sign, and can be told to fail. */
const recordingSigner = async (failure) => {
  const real = await createMemorySignerFromBytes(randomSeed());
  const state = { asked: 0 };
  const signer = {
    address: real.address,
    signMessages: real.signMessages,
    signTransactions: async (/** @type {any} */ transactions) => {
      state.asked += 1;
      if (failure) throw failure;
      return real.signTransactions(transactions);
    },
  };
  return { kit: { backend: "remote", signer: /** @type {any} */ (signer) }, state };
};

const headroom = (blocks) => ({
  ...SLOW,
  name: "headroom",
  lifetime: { ...SLOW.lifetime, minBlocksRemaining: blocks },
});

describe("sealing turns a draft into a signed v1 transaction [integration]", () => {
  test("a lifetime already expired is refused before any signer is asked", async () => {
    const node = startNode({ heights: [LAST_VALID + 1] });
    const { kit, state } = await recordingSigner();
    const { draft, deps } = await prepare(node, SLOW, kit);
    const error = await failureOf(sealDraft(deps, draft));
    expect(error).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (error).reason).toBe(EXPIRED_BEFORE_SIGNING);
    expect(state.asked).toBe(0);
    expect(node.calls).toEqual([...SEAL]);
  });

  test("the last valid height is still live, and a signed wire comes back", async () => {
    const node = startNode({ heights: [LAST_VALID] });
    const { draft, deps } = await prepare(node);
    const sealed = await Effect.runPromise(sealDraft(deps, draft));
    expect(sealed.lastValidBlockHeight).toBe(BigInt(LAST_VALID));
    expect(sealed.signature.length).toBeGreaterThan(60);
  });

  test("headroom below the mode's minimum is refused before signing", async () => {
    const node = startNode({ heights: [LAST_VALID - 5] });
    const { kit, state } = await recordingSigner();
    const { draft, deps } = await prepare(node, headroom(10), kit);
    const error = await failureOf(sealDraft(deps, draft));
    expect(/** @type {BuildRejected} */ (error).reason).toContain(
      "fewer than 10 blocks left before signing",
    );
    expect(state.asked).toBe(0);
  });

  test("headroom spent while signing is TransactionExpired, and nothing is sent", async () => {
    const node = startNode({ heights: [LAST_VALID - 20, LAST_VALID - 5] });
    const { draft, deps } = await prepare(node, headroom(10));
    const error = await failureOf(submitDraft(deps, { draft }, ALWAYS));
    expect(error).toBeInstanceOf(TransactionExpired);
    expect(/** @type {TransactionExpired} */ (error).reason).toContain("fewer than 10 blocks");
    expect(node.calls).toEqual([...SEAL, "getBlockHeight"]);
  });

  test("a mode without rechecks fetches the lifetime and never reads the height", async () => {
    const node = startNode();
    const unchecked = {
      ...SLOW,
      name: "unchecked",
      lifetime: { ...SLOW.lifetime, recheck: false },
    };
    const { draft, deps } = await prepare(node, unchecked);
    await Effect.runPromise(sealDraft(deps, draft));
    expect(node.calls).toEqual(["getLatestBlockhash"]);
  });
});

describe("sealing names its failures for what is known [integration]", () => {
  test("a signer failure is SignerUnavailable and carries none of the signer's words", async () => {
    const node = startNode();
    const failure = new Error("KMS refused: token expired for account 0xdeadbeef");
    const { kit, state } = await recordingSigner(failure);
    const { draft, deps } = await prepare(node, SLOW, kit);
    const error = await failureOf(submitDraft(deps, { draft }, ALWAYS));
    expect(error).toBeInstanceOf(SignerUnavailable);
    expect(/** @type {SignerUnavailable} */ (error).reason).toBe(SIGNER_FAILED);
    expect(/** @type {SignerUnavailable} */ (error).backend).toBe("remote");
    for (const leaked of ["KMS", "token expired", "0xdeadbeef"]) {
      expect(JSON.stringify(error)).not.toContain(leaked);
    }
    expect(state.asked).toBe(1);
    expect(node.calls).not.toContain("simulateTransaction");
    expect(node.calls).not.toContain("sendTransaction");
  });

  test("a v1 policy breach keeps its clause and no signer is asked", async () => {
    const node = startNode();
    const { kit, state } = await recordingSigner();
    const { draft, deps } = await prepare(node, SLOW, kit);
    const overpriced = { ...draft, config: { ...draft.config, priorityFeeLamports: 200_000n } };
    const error = await failureOf(sealDraft(deps, overpriced));
    expect(error).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (error).reason).toContain("priority fee");
    expect(state.asked).toBe(0);
  });
});

describe("sealing signs with every signer the draft carries [integration]", () => {
  test("an extra signer on an instruction's account signs beside the fee payer", async () => {
    const node = startNode();
    const { draft, deps } = await prepare(node);
    const extra = await createMemorySignerFromBytes(randomSeed());
    const fromExtra = getTransferSolInstruction({
      source: extra,
      destination: deps.kit.signer.address,
      amount: asLamports(1n),
    });
    const both = { ...draft, instructions: [...draft.instructions, fromExtra] };
    const sealed = await Effect.runPromise(sealDraft(deps, both));
    const decoded = getTransactionDecoder().decode(getBase64Codec().encode(sealed.wire));
    const signed = Object.entries(decoded.signatures).filter(([, bytes]) => bytes !== null);
    expect(new Set(signed.map(([address]) => address))).toEqual(
      new Set([deps.kit.signer.address, extra.address]),
    );
  });

  test("a draft is sealed as given: instruction order is preserved", async () => {
    const node = startNode();
    const { deps } = await prepare(node);
    const kit = deps.kit;
    const one = transferDraft(kit, { type: "transfer_sol", to: kit.signer.address, lamports: "1" });
    const two = transferDraft(kit, { type: "transfer_sol", to: kit.signer.address, lamports: "2" });
    const ordered = { ...one, instructions: [...one.instructions, ...two.instructions] };
    const sealed = await Effect.runPromise(sealDraft(deps, ordered));
    const decoded = getTransactionDecoder().decode(getBase64Codec().encode(sealed.wire));
    const message = decompileTransactionMessage(
      getCompiledTransactionMessageDecoder().decode(decoded.messageBytes),
    );
    // A System transfer's data is a u32 instruction index, then the u64 lamports.
    const amounts = message.instructions.map((ix) =>
      new DataView(Uint8Array.from(ix.data ?? []).buffer).getBigUint64(4, true),
    );
    expect(amounts).toEqual([1n, 2n]);
  });
});
