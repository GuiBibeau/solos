// @ts-check
import { BalanceReader, Signer } from "@solos/core";
import { ObservationReader } from "@solos/core/strategy";
import { Effect, Layer } from "effect";

/** Production reader: signer lamports and the Tick instant. Kinds never call this. */
export const liveObservationReader = Layer.effect(
  ObservationReader,
  Effect.gen(function* () {
    const signer = yield* Signer;
    const balances = yield* BalanceReader;
    return { read: (request) => readLive({ signer, balances }, request) };
  }),
);

/**
 * @param {{
 *   signer: import("@solos/core/wallet").SignerShape;
 *   balances: import("@solos/core/wallet").BalanceReaderShape;
 * }} sources
 * @param {{ readonly names: readonly string[]; readonly instant: number }} request
 */
const readLive = (sources, request) =>
  Effect.gen(function* () {
    /** @type {Record<string, string | number>} */
    const out = {};
    for (const name of request.names) {
      out[name] = yield* readName(sources, name, request.instant);
    }
    return out;
  });

/**
 * @param {{
 *   signer: import("@solos/core/wallet").SignerShape;
 *   balances: import("@solos/core/wallet").BalanceReaderShape;
 * }} sources
 * @param {string} name
 * @param {number} instant
 */
const readName = (sources, name, instant) =>
  Effect.gen(function* () {
    if (name === "instant") return instant;
    if (name === "lamports") return yield* lamportsOf(sources);
    return yield* Effect.fail({ reason: `observation ${name} is not produced` });
  });

/** @param {{ signer: import("@solos/core/wallet").SignerShape; balances: import("@solos/core/wallet").BalanceReaderShape }} sources */
const lamportsOf = (sources) =>
  Effect.gen(function* () {
    const lamports = yield* sources.balances.getLamports(yield* sources.signer.address());
    return lamports.toString();
  });
