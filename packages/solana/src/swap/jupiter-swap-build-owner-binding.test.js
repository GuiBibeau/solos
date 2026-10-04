// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { AMOUNT, INPUT_MINT, OUTPUT_MINT } from "./jupiter-swap-build-bodies.js";
import { buildEnvelope } from "./jupiter-swap-build-fixture.js";
import { ownerBindingRejection } from "./jupiter-swap-build-owner-binding.js";
import { ROUTE_LAYOUT_SLOTS } from "./jupiter-swap-build-route-accounts.js";
import { sharedSwapInstruction } from "./jupiter-swap-build-route-bodies.js";
import { derivedAta } from "./jupiter-swap-build-setup-account.js";
import { swapRouteLayout } from "./jupiter-swap-build-swapdata.js";
import { ATA_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./jupiter-swap-build-validate.js";

/**
 * The preflight binding of route and setup token programs to each requested mint's on-chain
 * owner. The crafted build rewrites the destination program, its ATA create, and the derived
 * route account to Token-2022 for a classic-owned mint: every static check passes because the
 * derived account matches, so only the discovered owner can refuse it before signing.
 */

/** @type {import("@solos-sh/actions").SwapAction} */
const action = {
  type: "swap",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: AMOUNT,
  maxSlippageBps: 50,
};

/** Both fixture mints are classic-token mints on chain. */
const classicOwners = { [INPUT_MINT]: TOKEN_PROGRAM, [OUTPUT_MINT]: TOKEN_PROGRAM };

/** @type {string} */
let taker;

beforeAll(async () => {
  taker = (await createMemorySignerFromBytes(new Uint8Array(32).fill(42))).address;
});

/** Rebind specific account slots to new pubkeys.
 * @param {{pubkey: string}[]} accounts @param {Record<number, string>} rebinds */
const rebound = (accounts, rebinds) =>
  accounts.map((a, at) => (rebinds[at] === undefined ? a : { ...a, pubkey: rebinds[at] }));

/** Move the destination route program slot to Token-2022 in either supported layout. */
/** @param {Awaited<ReturnType<typeof buildEnvelope>>} envelope */
const destinationProgram2022 = (envelope) => {
  const slots = ROUTE_LAYOUT_SLOTS[swapRouteLayout(envelope.swapInstruction)];
  if (!slots) throw new Error("test envelope used an unsupported layout");
  return {
    ...envelope,
    swapInstruction: {
      ...envelope.swapInstruction,
      accounts: rebound(envelope.swapInstruction.accounts, {
        [slots.destinationProgram]: TOKEN_2022_PROGRAM,
      }),
    },
  };
};

/** Move the destination ATA create to Token-2022 with its consistently derived account. */
/** @param {Awaited<ReturnType<typeof buildEnvelope>>} envelope */
const destinationCreate2022 = async (envelope) => {
  const destination = await derivedAta(taker, OUTPUT_MINT, TOKEN_2022_PROGRAM);
  return {
    ...envelope,
    setupInstructions: envelope.setupInstructions.map((ix) =>
      ix.programId !== ATA_PROGRAM || ix.accounts[3]?.pubkey !== OUTPUT_MINT
        ? ix
        : {
            ...ix,
            accounts: rebound(ix.accounts, {
              1: destination,
              5: TOKEN_2022_PROGRAM,
            }),
          },
    ),
  };
};

/** The crafted build from the issue: destination program, ATA create, and account all 2022. */
/** @param {Awaited<ReturnType<typeof buildEnvelope>>} envelope */
const craftedDestination2022 = async (envelope) =>
  destinationProgram2022(await destinationCreate2022(envelope));

describe("route and setup token programs bind to the mint's on-chain owner", () => {
  test("a destination moved to Token-2022 for a classic mint is refused before signing", async () => {
    const envelope = await craftedDestination2022(await buildEnvelope({ taker }));
    expect(ownerBindingRejection(envelope, action, classicOwners)).toContain(
      "output mint's on-chain owner",
    );
  });

  test("the honest build under its discovered owners is accepted", async () => {
    expect(
      ownerBindingRejection(await buildEnvelope({ taker }), action, classicOwners),
    ).toBeUndefined();
  });

  test("the same rewrite of the shared-accounts layout is refused", async () => {
    const honest = await buildEnvelope({ taker });
    const [authority, source, destination] = honest.swapInstruction.accounts.map((a) => a.pubkey);
    const shared = destinationProgram2022({
      ...honest,
      swapInstruction: sharedSwapInstruction(authority, source, destination),
    });
    expect(ownerBindingRejection(shared, action, classicOwners)).toContain(
      "output mint's on-chain owner",
    );
  });

  test("an ATA create moved to Token-2022 is refused even with honest route programs", async () => {
    const envelope = await destinationCreate2022(await buildEnvelope({ taker }));
    expect(ownerBindingRejection(envelope, action, classicOwners)).toContain("ATA create");
  });

  test("a requested mint whose owner could not be discovered fails closed", async () => {
    const envelope = await buildEnvelope({ taker });
    expect(ownerBindingRejection(envelope, action, {})).toContain("on-chain owner");
  });
});
