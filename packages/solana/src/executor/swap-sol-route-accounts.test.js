// @ts-check
import { describe, expect, test } from "bun:test";
import { RpcError } from "@solos/core";
import { EVENT_AUTHORITY, INPUT_MINT, OUTPUT_MINT } from "../swap/jupiter-swap-build-bodies.js";
import { sharedSwapInstruction } from "../swap/jupiter-swap-build-route-bodies.js";
import { TOKEN_PROGRAM } from "../swap/jupiter-swap-build-validate.js";
import { attackerAddress, reasonOf, runBranch } from "./swap-sol-driver.js";

const attacker = await attackerAddress();

/** @typedef {Awaited<ReturnType<import("../swap/jupiter-swap-build-fixture.js").buildEnvelope>>} Envelope */
/** @param {Envelope} envelope */
const sharedEnvelope = (envelope) => {
  const [taker, source, destination] = envelope.swapInstruction.accounts;
  return {
    ...envelope,
    swapInstruction: sharedSwapInstruction(taker.pubkey, source.pubkey, destination.pubkey),
  };
};

/** @param {(accounts: Envelope["swapInstruction"]["accounts"]) => Envelope["swapInstruction"]["accounts"]} mutate */
const withAccounts = (mutate) => (envelope) => ({
  ...envelope,
  swapInstruction: {
    ...envelope.swapInstruction,
    accounts: mutate(envelope.swapInstruction.accounts),
  },
});

/** @param {number} index @param {Partial<Envelope["swapInstruction"]["accounts"][number]>} patch */
const rebind = (index, patch) =>
  withAccounts((accounts) =>
    accounts.map((meta, at) => (at === index ? { ...meta, ...patch } : meta)),
  );

/** @param {Envelope} envelope */
const directDecoys = (envelope) => {
  const accounts = envelope.swapInstruction.accounts;
  return withAccounts(() => [
    accounts[0],
    ...accounts.slice(1, 5).map((meta) => ({ ...meta, pubkey: attacker })),
    ...accounts.slice(5),
    ...accounts.slice(1, 5),
  ])(envelope);
};

/** @param {Envelope} envelope */
const sharedDecoys = (envelope) => {
  const shared = sharedEnvelope(envelope);
  const accounts = shared.swapInstruction.accounts;
  const operative = new Set([2, 5, 6, 7]);
  return withAccounts((values) => [
    ...values.map((meta, index) => (operative.has(index) ? { ...meta, pubkey: attacker } : meta)),
    accounts[2],
    accounts[5],
    accounts[6],
    accounts[7],
  ])(shared);
};

/** @param {number} index @param {Partial<Envelope["swapInstruction"]["accounts"][number]>} patch */
const sharedRebind = (index, patch) => (envelope) => rebind(index, patch)(sharedEnvelope(envelope));

const directDestinationOptional = withAccounts((accounts) =>
  accounts.map((meta, index) =>
    index === 7 ? { ...accounts[2], isWritable: true, isSigner: false } : meta,
  ),
);

/** @param {number} takerSlot @returns {(envelope: Envelope) => Envelope} */
const withTakerInTail = (takerSlot) => (envelope) => {
  const taker = envelope.swapInstruction.accounts.at(takerSlot);
  return withAccounts((accounts) => [
    ...accounts,
    { ...accounts.at(-1), pubkey: taker.pubkey, isWritable: true },
  ])(envelope);
};

const sharedTakerInTail = (envelope) => withTakerInTail(1)(sharedEnvelope(envelope));

describe("Jupiter V2 fixed account slots before signer or RPC contact [integration]", () => {
  test("the current shared-accounts prefix reaches the first RPC gate", async () => {
    const { error } = await runBranch("execute", sharedEnvelope);
    expect(error).toBeInstanceOf(RpcError);
  });

  test("direct route rejects physical omission of its optional account slot", async () => {
    const withoutOptional = withAccounts((accounts) => [
      ...accounts.slice(0, 7),
      ...accounts.slice(8),
    ]);
    const { error, requests } = await runBranch("execute", withoutOptional);
    expect(reasonOf(error)).toContain("optional destination");
    expect(requests).toHaveLength(1);
  });

  test("direct route accepts Some as the exact writable taker destination ATA", async () => {
    const { error } = await runBranch("execute", directDestinationOptional);
    expect(error).toBeInstanceOf(RpcError);
  });

  test("direct route rejects operative attacker slots despite correct appended decoys", async () => {
    const { error, requests } = await runBranch("execute", directDecoys);
    expect(reasonOf(error)).toContain("source token account");
    expect(requests).toHaveLength(1);
  });

  test("shared route rejects operative attacker slots despite correct appended decoys", async () => {
    const { error, requests } = await runBranch("execute", sharedDecoys);
    expect(reasonOf(error)).toContain("source token account");
    expect(requests).toHaveLength(1);
  });

  test("direct fixed programs and roles are positional", async () => {
    const cases = [
      rebind(0, { isWritable: true }),
      rebind(3, { pubkey: OUTPUT_MINT }),
      rebind(4, { pubkey: INPUT_MINT }),
      rebind(5, { pubkey: attacker }),
      rebind(7, { pubkey: attacker }),
      rebind(7, { isWritable: true }),
      rebind(7, { isSigner: true }),
      withAccounts((accounts) =>
        accounts.map((meta, at) => (at === 7 ? { ...accounts[2], isWritable: false } : meta)),
      ),
      rebind(8, { pubkey: attacker }),
      rebind(9, { pubkey: EVENT_AUTHORITY }),
    ];
    for (const mutation of cases) {
      const { error } = await runBranch("execute", mutation);
      reasonOf(error);
    }
  });

  test("shared fixed programs and roles are positional", async () => {
    const cases = [
      sharedRebind(0, { isWritable: true }),
      sharedRebind(3, { isWritable: false }),
      sharedRebind(4, { isWritable: false }),
      sharedRebind(8, { pubkey: attacker }),
      sharedRebind(10, { pubkey: attacker }),
      sharedRebind(11, { pubkey: TOKEN_PROGRAM }),
    ];
    for (const mutation of cases) {
      const { error } = await runBranch("execute", mutation);
      reasonOf(error);
    }
  });

  test("the taker duplicated into the hop tail is refused for privilege elevation", async () => {
    for (const mutation of [withTakerInTail(0), sharedTakerInTail]) {
      const { error, requests } = await runBranch("execute", mutation);
      expect(reasonOf(error)).toContain("repeated the taker");
      expect(requests).toHaveLength(1);
    }
  });

  test("a hop tail without the taker still reaches the first RPC gate", async () => {
    const { error } = await runBranch("execute", sharedEnvelope);
    expect(error).toBeInstanceOf(RpcError);
  });
});
