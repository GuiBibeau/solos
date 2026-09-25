// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { getBase16Decoder } from "@solana/kit";
import { PortfolioStateSchema } from "@solos/actions";
import {
  getState,
  LendingEnumerationIncomplete,
  LendingVenue,
  LiquidityVenue,
  PerpVenue,
} from "@solos/core";
import { Cause, Effect, Layer, Option } from "effect";
import { PortfolioReaderLive, SolanaTestLive } from "../index.js";
import { randomAddress, tokenBytes } from "../liquidity/liquidity-token-fixture.js";
import { KEY } from "../market/jupiter-fixture.js";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { ensureSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";
import { TOKEN_PROGRAM } from "../wallet/parse-token-accounts.js";

const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RECEIPT = randomAddress();
const MARKET = randomAddress();
const OBLIGATION = randomAddress();
const TRADER = randomAddress();
const LP = randomAddress();

const never = () => Effect.die(new Error("venue fixture method not used in this test"));

/** Venue fixture: the kamino/Orca/Phoenix enumerations, offline and deterministic. */
const venueLayers = (over = {}) => {
  const lend = {
    getReserve: never,
    getPosition: never,
    listPositions: () =>
      Effect.succeed({
        positions: [
          {
            kind: /** @type {"lend"} */ ("lend"),
            protocol: /** @type {"kamino"} */ ("kamino"),
            market: MARKET,
            instrument: USDC,
            amount: "1000000",
            decimals: 6,
            valueUsd: null,
            positions: [OBLIGATION],
          },
        ],
        perpAccounts: [],
        receiptMints: [RECEIPT],
      }),
    ...over.lend,
  };
  const perp = {
    getPosition: never,
    listPositions: () =>
      Effect.succeed({
        positions: [
          {
            kind: /** @type {"perp"} */ ("perp"),
            protocol: /** @type {"phoenix"} */ ("phoenix"),
            account: TRADER,
            instrument: "SOL",
            side: /** @type {"long"} */ ("long"),
            amount: "100",
            decimals: 9,
            valueUsd: null,
          },
        ],
        perpAccounts: [
          { protocol: /** @type {"phoenix"} */ ("phoenix"), account: TRADER, equityUsd: "12.5" },
        ],
        receiptMints: [],
      }),
    ...over.perp,
  };
  const liquidity = {
    getPosition: never,
    // Protocol-aware, like the real adapters: each venue answers for itself and only the asked
    // protocol returns rows. A stub that ignored `protocol` would hand the same position back
    // for every venue, and the merged state would double-count it.
    listPositions: (/** @type {{ protocol: string }} */ request) =>
      request.protocol === "orca"
        ? Effect.succeed({
            positions: [
              {
                kind: /** @type {"lp"} */ ("lp"),
                protocol: /** @type {"orca"} */ ("orca"),
                position: LP,
                instrument: MARKET,
                liquidity: "1000",
                tokenA: { mint: USDC, amount: "500000", decimals: 6 },
                tokenB: { mint: WSOL, amount: "1000000", decimals: 9 },
                valueUsd: null,
              },
            ],
            perpAccounts: [],
            receiptMints: [],
          })
        : Effect.succeed({ positions: [], perpAccounts: [], receiptMints: [] }),
    ...over.liquidity,
  };
  return Layer.mergeAll(
    Layer.succeed(LendingVenue, lend),
    Layer.succeed(PerpVenue, perp),
    Layer.succeed(LiquidityVenue, liquidity),
  );
};

/** Loopback price feed: answers per requested mint, 500 for anything unpriced. */
const priceFixture = (prices) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const mint = new URL(request.url).searchParams.get("ids") ?? "";
      const usdPrice = prices.get(mint);
      if (usdPrice === undefined) return new Response("unpriced", { status: 500 });
      return Response.json({ [mint]: { usdPrice, blockId: 1, decimals: 9, priceChange24h: 0 } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

describe("portfolio read model through the composed adapters [integration]", () => {
  /** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
  let surfnet;
  /** @type {Uint8Array} */
  let seed;
  /** @type {string} */
  let sender;

  /**
   * The real wallet, price and venue layers with the venue fixtures taking precedence, and
   * the portfolio reader built on that overridden environment (it captures its dependencies
   * at build time).
   * @param {ReturnType<typeof priceFixture>} prices
   */
  const testLayer = (prices, over = {}) => {
    const base = Layer.merge(
      SolanaTestLive({
        rpcUrl: surfnet.rpcUrl,
        wsUrl: surfnet.wsUrl,
        seed,
        jupiter: { baseUrl: prices.url, apiKey: KEY },
      }),
      venueLayers(over),
    );
    return Layer.merge(base, PortfolioReaderLive().pipe(Layer.provide(base)));
  };

  beforeAll(async () => {
    surfnet = await ensureSurfnet();
    seed = randomSeed();
    sender = await seedAddress(seed);
    await surfnet.cheats.fundSol(sender, 1);
    await surfnet.cheats.ensureMint(USDC, 6);
    await surfnet.cheats.ensureMint(RECEIPT, 0);
    // Cash: 1 USDC at the ATA plus 0.5 USDC in a second token account (dedup + sum path).
    await surfnet.cheats.setTokenAccount(sender, USDC, "1000000");
    await jsonRpc(surfnet.rpcUrl, "surfnet_setAccount", [
      randomAddress(),
      {
        lamports: 1_461_600,
        data: getBase16Decoder().decode(tokenBytes(sender, USDC, 500_000n)),
        owner: TOKEN_PROGRAM,
        executable: false,
      },
    ]);
    // Positions: wSOL stays out of cash; the receipt token is dropped as venue-claimed.
    await surfnet.cheats.setTokenAccount(sender, WSOL, "300000000");
    await surfnet.cheats.setTokenAccount(sender, RECEIPT, "1");
  });

  test("wallet, venues and prices aggregate into the published schema with a valuation", async () => {
    const prices = priceFixture(
      new Map([
        [WSOL, 200],
        [USDC, 1],
      ]),
    );
    const state = await Effect.runPromise(getState({}).pipe(Effect.provide(testLayer(prices))));
    expect(() => PortfolioStateSchema.parse(state)).not.toThrow();
    expect(state.owner).toBe(sender);
    expect(state.cash.map((entry) => entry.instrument)).toEqual([USDC, "SOL"]);
    expect(state.cash[0]).toMatchObject({ amount: "1500000", valueUsd: "1.500000" });
    expect(state.cash[1]).toMatchObject({ amount: "1000000000", valueUsd: "200.000000" });
    expect(state.positions.map((entry) => entry.kind)).toEqual(["lend", "lp", "perp", "token"]);
    expect(state.positions[0]).toMatchObject({ instrument: USDC, valueUsd: "1.000000" });
    expect(state.positions[1]).toMatchObject({ valueUsd: "0.700000" });
    expect(state.positions[2]).toMatchObject({ instrument: "SOL", side: "long", valueUsd: null });
    expect(state.positions[3]).toMatchObject({ instrument: WSOL, amount: "300000000" });
    expect(state.perpAccounts).toEqual([
      { protocol: "phoenix", account: TRADER, equityUsd: "12.5" },
    ]);
    expect(state.valuationUsd).toBe("275.700000");
    prices.stop();
  });

  test("the receipt mint is excluded from wallet holdings", async () => {
    const prices = priceFixture(new Map([[WSOL, 200]]));
    const state = await Effect.runPromise(
      getState({ owner: sender }).pipe(Effect.provide(testLayer(prices))),
    );
    expect(state.positions.every((entry) => entry.instrument !== RECEIPT)).toBe(true);
    prices.stop();
  });

  // The point of #129: a venue with a read adapter must reach portfolio state. Omitting one
  // under-reports holdings silently, which "Complete enumeration" rules out — it returns every
  // supported position or fails explicitly.
  test("positions from every liquidity venue reach the state, without duplicates", async () => {
    const raydiumPosition = {
      kind: /** @type {"lp"} */ ("lp"),
      protocol: /** @type {"raydium"} */ ("raydium"),
      position: "9".repeat(43),
      instrument: "8".repeat(43),
      liquidity: "24012912330",
      tokenA: { mint: WSOL, amount: "913492918", decimals: 9 },
      tokenB: { mint: USDC, amount: "300989782", decimals: 6 },
      valueUsd: null,
    };
    const layer = testLayer(priceFixture(new Map()), {
      liquidity: {
        listPositions: (/** @type {{ protocol: string }} */ request) =>
          Effect.succeed({
            positions: request.protocol === "raydium" ? [raydiumPosition] : [],
            perpAccounts: [],
            receiptMints: [],
          }),
      },
    });
    const state = await Effect.runPromise(getState({}).pipe(Effect.provide(layer)));
    const lp = state.positions.filter((position) => position.kind === "lp");
    expect(lp).toHaveLength(1);
    expect(lp[0]).toMatchObject({ protocol: "raydium", liquidity: "24012912330" });
  });

  test("a venue that fails enumeration fails the read with its typed error", async () => {
    const prices = priceFixture(new Map());
    const layer = testLayer(prices, {
      lend: {
        listPositions: () =>
          Effect.fail(new LendingEnumerationIncomplete({ reason: "bound reached" })),
      },
    });
    const exit = await Effect.runPromiseExit(getState({}).pipe(Effect.provide(layer)));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure) && failure.value._tag).toBe("LendingEnumerationIncomplete");
    }
    prices.stop();
  });

  test("missing prices keep amounts and null the valuation", async () => {
    const prices = priceFixture(new Map());
    const state = await Effect.runPromise(
      getState({ owner: sender }).pipe(Effect.provide(testLayer(prices))),
    );
    expect(state.cash[0]).toMatchObject({ instrument: USDC, amount: "1500000", valueUsd: null });
    expect(state.valuationUsd).toBe(null);
    prices.stop();
  });
});
