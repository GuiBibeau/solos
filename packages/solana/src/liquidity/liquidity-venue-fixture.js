// @ts-check
/** @typedef {import("@solos/core").LiquidityVenueShape} LiquidityVenueShape */
/** @typedef {import("@solos/core").SignerShape} SignerShape */
import { tickIndexToSqrtPrice } from "@orca-so/whirlpools-core";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { getLpPosition, listLpPositions } from "@solos/core";
import { Cause, Effect, Layer, Option } from "effect";
import { ensureOfflineSurfnet, randomSeed } from "@solos/solana/surfnet";
import { LiquidityVenueLive } from "../index.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { KitSignerFromBytes } from "../signer/kit-signer.js";
import { SignerLive } from "../signer/signer-live.js";
import {
  randomAddress,
  seedWhirlpool,
  seedWhirlpoolPosition,
  SYSTEM_PROGRAM,
} from "./liquidity-seeds.js";
import { SQRT_PRICE_ONE } from "./whirlpool-fixture.js";

/** Funding liquidity for the funded fixture: well inside u64 for the quote cross-check. */
export const LIQUIDITY = 10n ** 12n;
/** The pool sqrt price of the below-range family: tick -2000, below every seeded range. */
export const BELOW_SQRT_PRICE = tickIndexToSqrtPrice(-2000);

/**
 * Shared harness for the liquidity adapter tests against the offline shared Surfnet: seeds
 * one pool family plus positions with NFT custody (and every corrupt variant), builds the
 * live `LiquidityVenue` layer (and the wallet Signer) over the Surfnet RPC, and exposes one
 * read returning the contract value or the tagged domain error. The Whirlpool program is
 * never invoked; accounts are written with the `surfnet_setAccount` cheatcode.
 */
/** Seed the below-range family: a pool at tick -2000 and a funded 0..1000 position. @param {string} rpcUrl @param {string} owner */
const seedBelowPosition = async (rpcUrl, owner) => {
  const pool = await seedWhirlpool(rpcUrl, { sqrtPrice: BELOW_SQRT_PRICE });
  return seedWhirlpoolPosition(rpcUrl, {
    pool: pool.pool,
    owner,
    liquidity: LIQUIDITY,
    tickLowerIndex: 0,
    tickUpperIndex: 1000,
  });
};

/** Seed the corrupt pool/mint families: wrong-discriminator pool, missing mints, a pool mint at a wrong owner program, and an undersized mint. @param {string} rpcUrl @param {(overrides: Partial<Parameters<typeof seedWhirlpoolPosition>[1]>) => ReturnType<typeof seedWhirlpoolPosition>} position */
const seedCorruptFamilies = async (rpcUrl, position) => {
  const badDiscPool = await seedWhirlpool(rpcUrl, {
    discriminator: new Uint8Array(8).fill(255),
    mints: false,
  });
  const againstBadDiscPool = await position({ pool: badDiscPool.pool });
  const noMintPool = await seedWhirlpool(rpcUrl, { mints: false });
  const againstNoMintPool = await position({ pool: noMintPool.pool });
  const wrongOwnerMintPool = await seedWhirlpool(rpcUrl, { corruptMint: "wrong-owner" });
  const againstWrongOwnerMint = await position({ pool: wrongOwnerMintPool.pool });
  const shortMintPool = await seedWhirlpool(rpcUrl, { corruptMint: "short" });
  const againstShortMint = await position({ pool: shortMintPool.pool });
  return {
    againstBadDiscPool,
    againstNoMintPool,
    againstWrongOwnerMint,
    againstShortMint,
  };
};

/** Seed one pool family, its positions with NFT custody, and every corrupt variant. @param {string} rpcUrl */
const seedFixtures = async (rpcUrl) => {
  const owner = randomAddress();
  const otherOwner = randomAddress();
  const pool = await seedWhirlpool(rpcUrl, { sqrtPrice: SQRT_PRICE_ONE });
  /** @type {(overrides: Partial<Parameters<typeof seedWhirlpoolPosition>[1]>) => ReturnType<typeof seedWhirlpoolPosition>} */
  const position = (overrides) =>
    seedWhirlpoolPosition(rpcUrl, { pool: pool.pool, owner, ...overrides });
  const funded = await position({ liquidity: LIQUIDITY });
  const empty = await position({});
  const foreign = await seedWhirlpoolPosition(rpcUrl, { pool: pool.pool, owner: otherOwner });
  const below = await seedBelowPosition(rpcUrl, owner);
  const badDiscriminator = await position({ discriminator: new Uint8Array(8).fill(255) });
  const shortBytes = await position({ bytes: 100 });
  const impostor = await position({ accountOwner: SYSTEM_PROGRAM });
  const missingPool = await position({ pool: randomAddress() });
  const corruptFamilies = await seedCorruptFamilies(rpcUrl, position);
  return {
    owner,
    otherOwner,
    pool,
    funded,
    empty,
    foreign,
    below,
    badDiscriminator,
    shortBytes,
    impostor,
    missingPool,
    ...corruptFamilies,
  };
};

export const startLiquidityVenueFixture = async () => {
  const surfnet = await ensureOfflineSurfnet();
  const rpcUrl = surfnet.rpcUrl;
  const fixtures = await seedFixtures(rpcUrl);
  const layer = Layer.merge(
    LiquidityVenueLive.pipe(
      Layer.provide(
        Layer.succeed(SolanaRpc, {
          url: rpcUrl,
          rpc: createSolanaRpc(rpcUrl),
          rpcSubscriptions: createSolanaRpcSubscriptions("ws://127.0.0.1:9"),
        }),
      ),
    ),
    SignerLive.pipe(Layer.provide(KitSignerFromBytes(randomSeed()))),
  );
  /**
   * @param {Effect.Effect<unknown, unknown, LiquidityVenueShape | SignerShape>} effect
   * @returns {Promise<unknown>}
   */
  const run = (effect) =>
    Effect.runPromiseExit(effect.pipe(Effect.provide(layer))).then((exit) => {
      if (exit._tag === "Failure") {
        const failure = Cause.failureOption(exit.cause);
        if (Option.isNone(failure)) {
          throw new Error(`expected a domain error: ${String(exit.cause)}`);
        }
        return failure.value;
      }
      return exit.value;
    });
  return {
    rpcUrl,
    ...fixtures,
    readPosition: (/** @type {Parameters<typeof getLpPosition>[0]} */ input) =>
      run(getLpPosition(input)),
    readEnumeration: (/** @type {Parameters<typeof listLpPositions>[0]} */ input) =>
      run(listLpPositions(input)),
  };
};
