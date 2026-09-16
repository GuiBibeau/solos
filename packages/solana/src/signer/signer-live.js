// @ts-check
import { Signer } from "@solos/core";
import { Effect, Layer } from "effect";
import { KitSigner } from "./kit-signer.js";

/** Core's `Signer` port: identity only, no key material. */
export const SignerLive = Layer.effect(
  Signer,
  Effect.map(KitSigner, (kit) => ({
    backend: kit.backend,
    address: () => Effect.succeed(kit.signer.address),
  })),
);
