// @ts-check
import { Effect } from "effect";
import { Signer } from "../ports/signer.js";

/** Address and backend of the configured signer. */
export const getAddress = () =>
  Effect.gen(function* () {
    const signer = yield* Signer;
    const address = yield* signer.address();
    return { address, backend: signer.backend };
  }).pipe(Effect.withSpan("wallet.getAddress"));
