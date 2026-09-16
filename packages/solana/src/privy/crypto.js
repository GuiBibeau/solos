// @ts-check
import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from "@hpke/core";
import canonicalize from "canonicalize";

/** Privy's suite for encrypting the ephemeral authorization key to us. */
const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Chacha20Poly1305(),
});

/** @param {string} base64 */
const fromBase64 = (base64) => Uint8Array.from(atob(base64), (c) => c.codePointAt(0) ?? 0);
/** @param {Uint8Array} bytes */
const toBase64 = (bytes) => btoa(String.fromCodePoint(...bytes));

/**
 * A fresh P-256 key pair. The public half goes to Privy as base64 SPKI; the private half decrypts
 * the authorization key it sends back. Lives only for one authenticate call.
 */
export const generateRecipientKeyPair = async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { privateKey: pair.privateKey, publicKeySpkiBase64: toBase64(spki) };
};

/**
 * @param {CryptoKey} privateKey
 * @param {{ encapsulated_key: string; ciphertext: string }} encrypted
 * @returns {Promise<string>} the authorization key as Privy formats it (PEM or base64 PKCS8)
 */
export const decryptAuthorizationKey = async (privateKey, encrypted) => {
  const recipient = await suite.createRecipientContext({
    recipientKey: privateKey,
    enc: fromBase64(encrypted.encapsulated_key).buffer,
  });
  const plain = await recipient.open(fromBase64(encrypted.ciphertext).buffer);
  return new TextDecoder().decode(plain);
};

/**
 * The exact bytes Privy expects signed: canonical JSON (RFC 8785) of the request envelope.
 * @param {{ appId: string; url: string; body: unknown }} request
 */
export const authorizationPayload = ({ appId, url, body }) => {
  const canonical = canonicalize({
    version: 1,
    method: "POST",
    url,
    body,
    headers: { "privy-app-id": appId },
  });
  if (canonical === undefined) throw new Error("request body is not canonicalizable JSON");
  return new TextEncoder().encode(canonical);
};

/** @param {string} authorizationKey PEM or base64 PKCS8, optionally prefixed `wallet-auth:` */
const importAuthorizationKey = (authorizationKey) => {
  const stripped = authorizationKey
    .replace(/^wallet-(auth|api):/, "")
    .replaceAll(/-----[^-]+-----/g, "")
    .replaceAll(/\s+/g, "");
  return crypto.subtle.importKey(
    "pkcs8",
    fromBase64(stripped),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
};

/** @param {Uint8Array} n big-endian unsigned integer */
const derInteger = (n) => {
  let start = 0;
  while (start < n.length - 1 && n[start] === 0) start += 1;
  const body = n.slice(start);
  const padded = (body[0] ?? 0) & 0x80 ? new Uint8Array([0, ...body]) : body;
  return new Uint8Array([0x02, padded.length, ...padded]);
};

/** WebCrypto yields raw r||s; Privy (like Node's `createSign`) wants a DER SEQUENCE. */
/** @param {Uint8Array} raw */
const toDerSignature = (raw) => {
  const r = derInteger(raw.slice(0, 32));
  const s = derInteger(raw.slice(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
};

/**
 * `privy-authorization-signature` header value.
 * @param {string} authorizationKey
 * @param {Uint8Array} payload
 */
export const signAuthorization = async (authorizationKey, payload) => {
  const key = await importAuthorizationKey(authorizationKey);
  const bytes = /** @type {BufferSource} */ (/** @type {unknown} */ (payload));
  const raw = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, bytes),
  );
  return toBase64(toDerSignature(raw));
};
