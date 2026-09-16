import { describe, expect, test } from "bun:test";
import { createPublicKey, verify } from "node:crypto";
import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from "@hpke/core";
import {
  authorizationPayload,
  decryptAuthorizationKey,
  generateRecipientKeyPair,
  signAuthorization,
} from "./crypto.js";

const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Chacha20Poly1305(),
});
const b64 = (bytes) => Buffer.from(bytes).toString("base64");

describe("privy crypto", () => {
  test("decrypts an HPKE payload encrypted to our SPKI public key, as Privy does", async () => {
    const pair = await generateRecipientKeyPair();
    const recipientPublic = await crypto.subtle.importKey(
      "spki",
      Buffer.from(pair.publicKeySpkiBase64, "base64"),
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    );
    const sender = await suite.createSenderContext({ recipientPublicKey: recipientPublic });
    const ciphertext = await sender.seal(new TextEncoder().encode("wallet-auth:secret"));
    const plain = await decryptAuthorizationKey(pair.privateKey, {
      encapsulated_key: b64(sender.enc),
      ciphertext: b64(ciphertext),
    });
    expect(plain).toBe("wallet-auth:secret");
  });

  test("canonical payload matches RFC 8785 key ordering and Privy's envelope", () => {
    const bytes = authorizationPayload({
      appId: "app",
      url: "https://auth.privy.io/api/oauth/v2/wallets/w1/rpc",
      body: { method: "signTransaction", params: { transaction: "AAA", encoding: "base64" } },
    });
    expect(new TextDecoder().decode(bytes)).toBe(
      '{"body":{"method":"signTransaction","params":{"encoding":"base64","transaction":"AAA"}},"headers":{"privy-app-id":"app"},"method":"POST","url":"https://auth.privy.io/api/oauth/v2/wallets/w1/rpc","version":1}',
    );
  });

  test("signature is DER ECDSA P-256/SHA-256 that Node verifies, from PEM or base64 PKCS8 keys", async () => {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const pkcs8 = b64(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
    const publicKey = createPublicKey({
      key: Buffer.from(await crypto.subtle.exportKey("spki", keys.publicKey)),
      format: "der",
      type: "spki",
    });
    const payload = authorizationPayload({ appId: "app", url: "https://x/y", body: { a: 1 } });
    for (const key of [pem, pkcs8, `wallet-auth:${pkcs8}`]) {
      const signature = await signAuthorization(key, payload);
      expect(
        verify(
          "sha256",
          Buffer.from(payload),
          { key: publicKey, dsaEncoding: "der" },
          Buffer.from(signature, "base64"),
        ),
      ).toBe(true);
    }
  });
});
