// @ts-check
import { describe, expect, test } from "bun:test";
import { getBase64Codec } from "@solana/kit";
import { RpcError } from "@solos/core";
import { OUTPUT_MINT } from "../swap/jupiter-swap-build-bodies.js";
import { derivedAta } from "../swap/jupiter-swap-build-setup-account.js";
import {
  ATA_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
} from "../swap/jupiter-swap-build-validate.js";
import { attackerAddress, reasonOf, runBranch } from "./swap-sol-driver.js";

const attacker = await attackerAddress();

/** @typedef {Awaited<ReturnType<import("../swap/jupiter-swap-build-fixture.js").buildEnvelope>>} Envelope */
/** @typedef {Envelope["setupInstructions"][number]["accounts"]} Accounts */

/** @param {(accounts: Accounts) => Accounts} mutate */
const withCreateAccounts = (mutate) => (envelope) => {
  const [create, ...rest] = envelope.setupInstructions;
  if (!create) throw new Error("fixture envelope has no ATA create");
  return {
    ...envelope,
    setupInstructions: [{ ...create, accounts: mutate(create.accounts) }, ...rest],
  };
};

/** @param {number} index @param {Partial<Accounts[number]>} patch */
const rebind = (index, patch) =>
  withCreateAccounts((accounts) =>
    accounts.map((meta, at) => (at === index ? { ...meta, ...patch } : meta)),
  );

/** @param {Accounts} accounts @param {{accountIndex: number, programIndex: number, account: string, program: string}} pair */
const rebindPair = (accounts, pair) =>
  accounts.map((meta, at) => {
    if (at === pair.accountIndex) return { ...meta, pubkey: pair.account };
    if (at === pair.programIndex) return { ...meta, pubkey: pair.program };
    return meta;
  });

/** @param {Envelope} envelope */
const withToken2022 = async (envelope) => {
  const [create, ...rest] = envelope.setupInstructions;
  if (!create) throw new Error("fixture envelope has no ATA create");
  const taker = create.accounts[2]?.pubkey ?? "";
  const destination = await derivedAta(taker, OUTPUT_MINT, TOKEN_2022_PROGRAM);
  return {
    ...envelope,
    setupInstructions: [
      {
        ...create,
        accounts: rebindPair(create.accounts, {
          accountIndex: 1,
          programIndex: 5,
          account: destination,
          program: TOKEN_2022_PROGRAM,
        }),
      },
      ...rest,
    ],
    swapInstruction: {
      ...envelope.swapInstruction,
      accounts: rebindPair(envelope.swapInstruction.accounts, {
        accountIndex: 2,
        programIndex: 6,
        account: destination,
        program: TOKEN_2022_PROGRAM,
      }),
    },
  };
};

/** @param {Envelope} envelope */
const pairedProgramDecoy = async (envelope) => {
  const [create] = envelope.setupInstructions;
  if (!create) throw new Error("fixture envelope has no ATA create");
  const destination = await derivedAta(create.accounts[2]?.pubkey ?? "", OUTPUT_MINT, attacker);
  return withCreateAccounts((accounts) =>
    rebindPair(accounts, {
      accountIndex: 1,
      programIndex: 5,
      account: destination,
      program: attacker,
    }),
  )(envelope);
};

/** @param {Envelope} envelope */
const withTrailingAtaData = (envelope) => {
  const [create, ...rest] = envelope.setupInstructions;
  if (!create) throw new Error("fixture envelope has no ATA create");
  const data = getBase64Codec().decode(Uint8Array.of(1, 0));
  return { ...envelope, setupInstructions: [{ ...create, data }, ...rest] };
};

describe("ATA setup fixed account contract before RPC contact", () => {
  test("a canonical Token-2022 destination ATA remains supported", async () => {
    const { error } = await runBranch("execute", withToken2022);
    expect(error).toBeInstanceOf(RpcError);
  });

  test("an attacker program and its matching derived account are refused", async () => {
    const { error } = await runBranch("execute", pairedProgramDecoy);
    expect(reasonOf(error)).toBe("setup ATA create did not bind a supported token program");
  });

  test("the Associated Token and System program identities are exact", async () => {
    const program = async (envelope) => {
      const [create, ...rest] = envelope.setupInstructions;
      if (!create) throw new Error("fixture envelope has no ATA create");
      return { ...envelope, setupInstructions: [{ ...create, programId: attacker }, ...rest] };
    };
    expect(reasonOf((await runBranch("execute", program)).error)).toContain("known ATA");
    expect(reasonOf((await runBranch("execute", rebind(4, { pubkey: attacker }))).error)).toBe(
      "setup ATA create did not bind the System program",
    );
    expect(ATA_PROGRAM).not.toBe(attacker);
    expect(SYSTEM_PROGRAM).not.toBe(attacker);
  });

  test("the idempotent-create payload has no trailing bytes", async () => {
    expect(reasonOf((await runBranch("execute", withTrailingAtaData)).error)).toContain(
      "unknown ATA",
    );
  });

  test("exact cardinality and every signer/writable role are enforced", async () => {
    const extra = withCreateAccounts((accounts) => [...accounts, accounts[5]]);
    const short = withCreateAccounts((accounts) => accounts.slice(0, 5));
    for (const mutate of [extra, short]) {
      expect(reasonOf((await runBranch("execute", mutate)).error)).toContain("exact");
    }
    const mutations = [
      rebind(0, { isWritable: false }),
      rebind(1, { isWritable: false }),
      rebind(1, { isSigner: true }),
      rebind(2, { isWritable: true }),
      rebind(2, { isSigner: true }),
      rebind(3, { isWritable: true }),
      rebind(4, { isWritable: true }),
      rebind(5, { isWritable: true }),
    ];
    for (const mutate of mutations) reasonOf((await runBranch("execute", mutate)).error);
  });
});
