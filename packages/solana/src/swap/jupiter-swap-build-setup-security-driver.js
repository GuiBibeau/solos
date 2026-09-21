// @ts-check
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { getBase64Codec } from "@solana/kit";
import { buildRejection } from "./jupiter-swap-build-accounts.js";
import { AMOUNT, INPUT_MINT, OUTPUT_MINT } from "./jupiter-swap-build-bodies.js";
import { buildEnvelope, fixtureAtas } from "./jupiter-swap-build-fixture.js";
import { ATA_PROGRAM } from "./jupiter-swap-build-validate.js";

/** @param {string} pubkey @param {boolean} isWritable @param {boolean} isSigner */
export const meta = (pubkey, isWritable, isSigner) => ({ pubkey, isWritable, isSigner });
/** @param {...number} bytes */
export const b64 = (...bytes) => getBase64Codec().decode(Uint8Array.of(...bytes));

/** @type {import("@solos/actions").SwapAction} */
const ACTION = {
  type: "swap",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: AMOUNT,
  maxSlippageBps: 50,
};

export const createSetupSecurityDriver = async () => {
  const signer = await createMemorySignerFromBytes(new Uint8Array(32).fill(42));
  const taker = signer.address;
  const atas = await fixtureAtas(taker);
  const envelope = await buildEnvelope({ taker });
  const action = ACTION;

  /** @param {Record<string, unknown>} envelopeOverrides
   * @param {Partial<import("@solos/actions").SwapAction>} actionOverrides */
  const rejectionForAction = (envelopeOverrides, actionOverrides) =>
    buildRejection(
      { ...envelope, ...envelopeOverrides },
      /** @type {import("@solos/actions").SwapAction} */ ({ ...action, ...actionOverrides }),
      taker,
    );

  /** @param {Record<string, unknown>} overrides */
  const rejectionFor = (overrides) => rejectionForAction(overrides, {});

  /** @param {number} index @param {{ pubkey: string; isWritable: boolean; isSigner: boolean }} account */
  const withCreatedAccount = (index, account) => {
    const createAt = envelope.setupInstructions.findIndex((ix) => ix.programId === ATA_PROGRAM);
    const create = envelope.setupInstructions[createAt];
    if (!create || createAt === -1) throw new Error("fixture lacked ATA create");
    const attacked = {
      ...create,
      accounts: create.accounts.map((candidate, offset) =>
        offset === index ? account : candidate,
      ),
    };
    return rejectionFor({
      setupInstructions: envelope.setupInstructions.map((ix, at) =>
        at === createAt ? attacked : ix,
      ),
    });
  };

  return {
    action,
    atas,
    envelope,
    rejectionFor,
    rejectionForAction,
    taker,
    withCreatedAccount,
  };
};
