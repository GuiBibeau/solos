// @ts-check
import { expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  appendTransactionMessageInstructions,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
} from "@solana/kit";
import {
  assertV1MessageForSigning,
  beginV1Message,
  signV1Message,
} from "../executor/transaction-v1.js";
import { TRANSFER_V1_CONFIG } from "../executor/transfer-sol.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { createPrivyOAuthSigner } from "./oauth-signer.js";

const freshSession = () => ({
  refreshToken: "refresh",
  accessToken: "access",
  accessTokenExpiresAt: Date.now() + 600_000,
  authorizationKey: "authorization",
  authorizationKeyExpiresAt: Date.now() + 600_000,
});

test("Privy can return only a signature and cannot replace the original v1 message [integration]", async () => {
  const wallet = await createMemorySignerFromBytes(randomSeed());
  /** @type {Uint8Array | undefined} */
  let backendMessage;
  const api = {
    /** @param {{ body: { params: { transaction: string } } }} input */
    walletRpc: async ({ body }) => {
      const transaction = getTransactionDecoder().decode(
        getBase64Encoder().encode(body.params.transaction),
      );
      const messageBytes = Uint8Array.from(transaction.messageBytes);
      messageBytes[messageBytes.length - 1] ^= 1;
      backendMessage = messageBytes;
      const mutated = { ...transaction, messageBytes };
      const [signature] = await wallet.signTransactions([mutated]);
      const signed = { ...mutated, signatures: { ...mutated.signatures, ...signature } };
      return Response.json({
        data: { signed_transaction: getBase64EncodedWireTransaction(signed) },
      });
    },
  };
  const signer = createPrivyOAuthSigner({
    api: /** @type {import("./api.js").PrivyApi} */ (/** @type {unknown} */ (api)),
    walletId: "wallet",
    walletAddress: wallet.address,
    session: freshSession(),
    persist: () => {},
  });
  const message = appendTransactionMessageInstructions(
    [{ programAddress: "11111111111111111111111111111111", data: new Uint8Array([1]) }],
    beginV1Message({ feePayerSigner: signer, config: TRANSFER_V1_CONFIG }),
  );
  const originalMessage = assertV1MessageForSigning(message).bytes;
  const signed = await signV1Message(message);
  expect(signed.messageBytes).toEqual(originalMessage);
  expect(backendMessage).not.toEqual(originalMessage);
});
