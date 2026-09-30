// @ts-check
import { describe, expect, test } from "bun:test";
import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64Codec,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { unsignedWire } from "./simulate.js";

const BLOCKHASH = /** @type {import("@solana/kit").Blockhash} */ (
  "11111111111111111111111111111111"
);

/** One signed transfer, as Submission seals it. */
const signedWire = async () => {
  const payer = await generateKeyPairSigner();
  const recipient = await generateKeyPairSigner();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH, lastValidBlockHeight: 1n },
        m,
      ),
    (m) =>
      appendTransactionMessageInstruction(
        getTransferSolInstruction({
          source: payer,
          destination: recipient.address,
          amount: 1n,
        }),
        m,
      ),
  );
  const signed = await signTransactionMessageWithSigners(message);
  return { wire: getBase64EncodedWireTransaction(signed), payer: payer.address };
};

/** @param {import("@solana/kit").Base64EncodedWireTransaction} wire */
const decode = (wire) => getTransactionDecoder().decode(getBase64Codec().encode(wire));

describe("unsignedWire", () => {
  test("keeps the message bytes and zeroes every signature", async () => {
    const { wire, payer } = await signedWire();
    const signed = decode(wire);
    const unsigned = decode(unsignedWire(wire));
    expect(unsigned.messageBytes).toEqual(signed.messageBytes);
    expect(Object.keys(unsigned.signatures)).toEqual([payer]);
    const signature = signed.signatures[payer];
    expect(signature).not.toBeNull();
    expect([...(signature ?? [])].some((byte) => byte !== 0)).toBe(true);
    // The decoder reports an all-zero signature slot as absent.
    expect(unsigned.signatures[payer]).toBeNull();
  });

  test("the zeroed wire is the same length as the signed one", async () => {
    const { wire } = await signedWire();
    expect(getBase64Codec().encode(unsignedWire(wire)).length).toBe(
      getBase64Codec().encode(wire).length,
    );
  });
});
