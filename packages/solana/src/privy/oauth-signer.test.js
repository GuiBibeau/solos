import { describe, expect, test } from "bun:test";
import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from "@hpke/core";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import {
  address,
  appendTransactionMessageInstructions,
  assertIsFullySignedTransaction,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  lamports,
  pipe,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { beginV1Message, signV1Message } from "../executor/transaction-v1.js";
import { TRANSFER_V1_CONFIG } from "../executor/transfer-sol.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { privyApi } from "./api.js";
import { createPrivyOAuthSigner } from "./oauth-signer.js";

const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Chacha20Poly1305(),
});
const b64 = (bytes) => Buffer.from(bytes).toString("base64");

const freshAuthorizationKey = async () => {
  const key = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
  ]);
  return b64(await crypto.subtle.exportKey("pkcs8", key.privateKey));
};

/** Encrypt a fresh authorization key to the caller's SPKI key, as Privy does. */
const encryptedKeyFor = async (recipientSpkiBase64) => {
  const pub = await crypto.subtle.importKey(
    "spki",
    Buffer.from(recipientSpkiBase64, "base64"),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  const sender = await suite.createSenderContext({ recipientPublicKey: pub });
  const ciphertext = await sender.seal(new TextEncoder().encode(await freshAuthorizationKey()));
  return { encapsulated_key: b64(sender.enc), ciphertext: b64(ciphertext) };
};

/**
 * A fake Privy: the "wallet" is a local keypair; the RPC endpoint signs whatever base64 tx it gets.
 * The first RPC call answers 401 once to exercise the refresh path.
 */
const fakePrivy = async () => {
  const wallet = await createMemorySignerFromBytes(randomSeed());
  const calls = [];
  let rpcCalls = 0;
  const signForWallet = async (body) => {
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(body.params.transaction));
    expect(getCompiledTransactionMessageDecoder().decode(tx.messageBytes).version).toBe(1);
    const [signatures] = await wallet.signTransactions([tx]);
    const signed = { ...tx, signatures: { ...tx.signatures, ...signatures } };
    return Response.json({
      method: "signTransaction",
      data: { signed_transaction: getBase64EncodedWireTransaction(signed), encoding: "base64" },
    });
  };
  const handlers = {
    "/token": async () =>
      Response.json({
        access_token: `at-${calls.length}`,
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: `rt-${calls.length}`,
      }),
    "/wallets/authenticate": async (body) =>
      Response.json({
        encrypted_authorization_key: await encryptedKeyFor(body.recipient_public_key),
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        wallets: [{ id: "w1", address: wallet.address, chain_type: "solana" }],
      }),
    "/wallets/w1/rpc": async (body, init) => {
      rpcCalls += 1;
      if (rpcCalls === 1) return new Response("expired", { status: 401 });
      expect(init.headers["privy-authorization-signature"]).toBeTruthy();
      return signForWallet(body);
    },
  };
  const fetchImpl = async (url, init) => {
    calls.push(url);
    const route = Object.keys(handlers).find((suffix) => url.endsWith(suffix));
    if (!route) return new Response("not found", { status: 404 });
    return handlers[route](JSON.parse(init.body), init);
  };
  return { wallet, fetchImpl, calls };
};

describe("privy OAuth signer [integration]", () => {
  test("signs through the RPC, recovers from a 401 by refreshing, and persists the new session", async () => {
    const { wallet, fetchImpl, calls } = await fakePrivy();
    const api = privyApi(
      { appId: "app", authBaseUrl: "https://auth.test", agentUrl: "https://agents.test" },
      fetchImpl,
    );
    const persisted = [];
    const signer = createPrivyOAuthSigner({
      api,
      walletId: "w1",
      walletAddress: wallet.address,
      persist: (s) => void persisted.push(s),
      session: {
        refreshToken: "rt-0",
        accessToken: "at-0",
        accessTokenExpiresAt: Date.now() + 10 * 60_000,
        authorizationKey: await freshAuthorizationKey(),
        authorizationKeyExpiresAt: Date.now() + 10 * 60_000,
      },
    });
    const message = pipe(
      beginV1Message({ feePayerSigner: signer, config: TRANSFER_V1_CONFIG }),
      (m) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: address("11111111111111111111111111111111"), lastValidBlockHeight: 1n },
          m,
        ),
      (m) =>
        appendTransactionMessageInstructions(
          [
            getTransferSolInstruction({
              source: signer,
              destination: address("7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY"),
              amount: lamports(1n),
            }),
          ],
          m,
        ),
    );
    const signed = await signV1Message(message);
    assertIsFullySignedTransaction(signed);
    expect(Object.keys(signed.signatures)).toEqual([wallet.address]);
    expect(getCompiledTransactionMessageDecoder().decode(signed.messageBytes).version).toBe(1);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].refreshToken).toMatch(/^rt-/);
    expect(calls.filter((u) => u.endsWith("/rpc"))).toHaveLength(2);
    expect(calls.filter((u) => u.endsWith("/token"))).toHaveLength(1);
  });
});
