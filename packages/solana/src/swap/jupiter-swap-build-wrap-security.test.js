// @ts-check
import { describe, expect, test } from "bun:test";
import { getU64Codec } from "@solana/kit";
import { INPUT_MINT, OUTPUT_MINT } from "./jupiter-swap-build-bodies.js";
import {
  b64,
  createSetupSecurityDriver,
  meta,
} from "./jupiter-swap-build-setup-security-driver.js";
import { SYSTEM_PROGRAM, TOKEN_PROGRAM } from "./jupiter-swap-build-validate.js";

const driver = await createSetupSecurityDriver();

describe("wSOL wrap ownership bindings before signing", () => {
  test("a wSOL funding transfer of the wrong amount is rejected", async () => {
    const wrong = {
      programId: SYSTEM_PROGRAM,
      accounts: [meta(driver.taker, true, true), meta(driver.atas.sourceAta, true, false)],
      data: b64(2, 0, 0, 0, ...getU64Codec().encode(BigInt(driver.action.amount) + 1n)),
    };
    const setup = driver.envelope.setupInstructions.map((ix) =>
      ix.programId === SYSTEM_PROGRAM ? wrong : ix,
    );
    expect(await driver.rejectionFor({ setupInstructions: setup })).toContain(
      "did not carry the exact requested input amount",
    );
  });

  test("a SyncNative without the exact transfer behind it is rejected", async () => {
    const sync = {
      programId: TOKEN_PROGRAM,
      accounts: [meta(driver.atas.sourceAta, true, false)],
      data: b64(17),
    };
    expect(await driver.rejectionFor({ setupInstructions: [sync] })).toContain(
      "outside the documented wSOL wrap",
    );
  });

  test("a SyncNative on a foreign account is rejected", async () => {
    const setup = driver.envelope.setupInstructions.map((ix) =>
      ix.accounts.length === 1
        ? { ...ix, accounts: [meta(driver.atas.destinationAta, true, false)] }
        : ix,
    );
    expect(await driver.rejectionFor({ setupInstructions: setup })).toContain(
      "temporary wSOL account",
    );
  });

  test("a wSOL funding transfer with no SyncNative behind it is rejected", async () => {
    const setup = driver.envelope.setupInstructions.filter((ix) => ix.accounts.length !== 1);
    expect(await driver.rejectionFor({ setupInstructions: setup })).toContain(
      "no SyncNative behind it",
    );
  });

  test("a duplicate wSOL funding transfer is rejected", async () => {
    const setup = driver.envelope.setupInstructions;
    const transfer = setup.find((ix) => ix.programId === SYSTEM_PROGRAM);
    if (!transfer) throw new Error("fixture lacked wrap transfer");
    expect(await driver.rejectionFor({ setupInstructions: [...setup, transfer] })).toContain(
      "more than one wSOL funding transfer",
    );
  });

  test("a duplicate SyncNative is rejected", async () => {
    const setup = driver.envelope.setupInstructions;
    const sync = setup.find((ix) => ix.accounts.length === 1);
    if (!sync) throw new Error("fixture lacked SyncNative");
    expect(await driver.rejectionFor({ setupInstructions: [...setup, sync] })).toContain(
      "more than one SyncNative",
    );
  });

  test("a SyncNative preceding its funding transfer is rejected", async () => {
    const setup = [...driver.envelope.setupInstructions];
    const transferAt = setup.findIndex((ix) => ix.programId === SYSTEM_PROGRAM);
    const syncAt = setup.findIndex((ix) => ix.accounts.length === 1);
    const transfer = setup[transferAt];
    const sync = setup[syncAt];
    if (!transfer || !sync) throw new Error("fixture lacked wrap pair");
    setup[transferAt] = sync;
    setup[syncAt] = transfer;
    expect(await driver.rejectionFor({ setupInstructions: setup })).toContain(
      "did not follow the wSOL funding transfer",
    );
  });

  test("wrap instructions for a non-wSOL input are rejected", async () => {
    const inverted = { inputMint: OUTPUT_MINT, outputMint: INPUT_MINT };
    expect(await driver.rejectionForAction(inverted, inverted)).toContain(
      "moved native SOL without a wSOL input",
    );
  });
});
