// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getBase58Decoder } from "@solana/kit";
import { getLendPosition, listLendPositions } from "@solos/core/lend";
import { Effect } from "effect";
import { SolanaTestLive } from "../index.js";
import {
  ensureSurfnet,
  jsonRpc,
  randomSeed,
  seedAddress,
  surfnetCheatcodes,
  USDC_MINT,
} from "../surfnet/index.js";
import {
  positionMarketBytes,
  positionObligationBytes,
  positionReserveBytes,
  seedKaminoAccount,
} from "./kamino-position-fixture.js";
/** @typedef {"duplicate" | "fail-owner" | "corrupt-reserve" | "fixed-ledger"} ProxyMode */
/** @param {unknown} request */
const isOwnerScan = (request) => {
  const value = /** @type {{ method?: string; params?: any[] }} */ (request);
  const filters = value.params?.[1]?.filters ?? [];
  return (
    value.method === "getProgramAccounts" &&
    filters.some((filter) => Number(filter.memcmp?.offset) === 64)
  );
};
/** @param {string} target @param {ProxyMode} mode @param {number} [fixedSlot] */
const startRpcProxy = (target, mode, fixedSlot) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.text();
      const payload = JSON.parse(body);
      if (mode === "fixed-ledger" && payload.method === "getSlot") {
        return Response.json({ jsonrpc: "2.0", id: payload.id, result: fixedSlot });
      }
      if (mode === "fail-owner" && isOwnerScan(payload)) {
        return Response.json({
          jsonrpc: "2.0",
          id: payload.id,
          error: { code: -32_000, message: "secret provider failure" },
        });
      }
      const upstream = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const response = await upstream.json();
      if (mode === "duplicate" && isOwnerScan(payload) && Array.isArray(response.result)) {
        response.result =
          response.result.length > 0 ? [...response.result, response.result[0]] : [];
      }
      if (
        mode === "corrupt-reserve" &&
        payload.method === "getProgramAccounts" &&
        !isOwnerScan(payload) &&
        Array.isArray(response.result) &&
        response.result[0]
      ) {
        response.result[0].account.data[0] = "AA==";
      }
      return Response.json(response, { status: upstream.status });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
};
/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */ let surfnet;
/** @type {ReturnType<typeof startRpcProxy>} */ let duplicateRpc;
/** @type {ReturnType<typeof startRpcProxy>} */ let failingRpc;
/** @type {ReturnType<typeof startRpcProxy>} */ let corruptRpc;
/** @type {ReturnType<typeof startRpcProxy>} */ let referralRpc;
/** @type {Uint8Array} */ let signerSeed;
/** @type {{ market: string; owner: string; emptyOwner: string; reserves: string[]; secondMint: string; receipts: string[]; referral: { market: string; reserve: string; receipt: string } }} */
let fixture;
beforeAll(async () => {
  surfnet = await ensureSurfnet();
  const initialSlot = BigInt(
    /** @type {string | number} */ (await jsonRpc(surfnet.rpcUrl, "getSlot")),
  );
  const targetSlot = initialSlot + 1000n;
  signerSeed = randomSeed();
  const addresses = await Promise.all(Array.from({ length: 13 }, () => seedAddress(randomSeed())));
  const [
    market,
    firstReserve,
    secondReserve,
    firstReceipt,
    secondReceipt,
    first,
    second,
    emptyOwner,
    referralMarket,
    referralReserve,
    referralReceipt,
    referralObligation,
  ] = addresses;
  const owner = await seedAddress(signerSeed);
  const secondMint = getBase58Decoder().decode(new Uint8Array(32).fill(91));
  await seedKaminoAccount(surfnet.rpcUrl, market, positionMarketBytes({ referralFeeBps: 37 }));
  await seedKaminoAccount(
    surfnet.rpcUrl,
    firstReserve,
    positionReserveBytes({
      market,
      mint: USDC_MINT,
      receiptMint: firstReceipt,
      available: 1000n,
      collateralSupply: 500n,
      decimals: 6,
    }),
  );
  await seedKaminoAccount(
    surfnet.rpcUrl,
    referralMarket,
    positionMarketBytes({ referralFeeBps: 37 }),
  );
  await seedKaminoAccount(
    surfnet.rpcUrl,
    referralReserve,
    positionReserveBytes({
      market: referralMarket,
      mint: USDC_MINT,
      receiptMint: referralReceipt,
      available: 1_000_000n,
      borrowed: 1_000_000_000_000_000_000n,
      collateralSupply: 1_000_000_000_000_000_000n,
      protocolTakeRatePct: 50,
      borrowRateBps: 100,
      lastUpdateSlot: targetSlot - 1n,
      decimals: 6,
    }),
  );
  await seedKaminoAccount(
    surfnet.rpcUrl,
    referralObligation,
    positionObligationBytes({
      market: referralMarket,
      owner,
      deposits: [{ reserve: referralReserve, amount: 1_000_000_000_000_000_000n }],
    }),
  );
  await surfnetCheatcodes(surfnet.rpcUrl).timeTravelToSlot(Number(targetSlot));
  await seedKaminoAccount(
    surfnet.rpcUrl,
    secondReserve,
    positionReserveBytes({
      market,
      mint: secondMint,
      receiptMint: secondReceipt,
      available: 500n,
      collateralSupply: 1000n,
      decimals: 9,
    }),
  );
  await seedKaminoAccount(
    surfnet.rpcUrl,
    first,
    positionObligationBytes({
      market,
      owner,
      deposits: [{ reserve: firstReserve, amount: 125n }],
      borrowReserve: secondReserve,
    }),
  );
  await seedKaminoAccount(
    surfnet.rpcUrl,
    second,
    positionObligationBytes({
      market,
      owner,
      deposits: [
        { reserve: firstReserve, amount: 26n },
        { reserve: secondReserve, amount: 40n },
      ],
    }),
  );
  duplicateRpc = startRpcProxy(surfnet.rpcUrl, "duplicate");
  failingRpc = startRpcProxy(surfnet.rpcUrl, "fail-owner");
  corruptRpc = startRpcProxy(surfnet.rpcUrl, "corrupt-reserve");
  referralRpc = startRpcProxy(surfnet.rpcUrl, "fixed-ledger", Number(targetSlot));
  fixture = {
    market,
    owner,
    emptyOwner,
    reserves: [firstReserve, secondReserve],
    secondMint,
    receipts: [firstReceipt, secondReceipt].toSorted((a, b) => a.localeCompare(b)),
    referral: { market: referralMarket, reserve: referralReserve, receipt: referralReceipt },
  };
});
afterAll(() => {
  duplicateRpc?.stop();
  failingRpc?.stop();
  corruptRpc?.stop();
  referralRpc?.stop();
});
/** @param {string} rpcUrl */
const layer = (rpcUrl, market = fixture.market) =>
  SolanaTestLive({
    rpcUrl,
    wsUrl: surfnet.wsUrl,
    seed: signerSeed,
    kamino: { market },
  });
describe("Kamino owner position reads through the live adapter [integration]", () => {
  test("uses the decoded market referral fee through get and list position reads", async () => {
    const live = layer(referralRpc.url, fixture.referral.market);
    const input = { mint: USDC_MINT, owner: fixture.owner };
    const withFee = await Effect.runPromise(getLendPosition(input).pipe(Effect.provide(live)));
    const listed = await Effect.runPromise(
      listLendPositions({ owner: fixture.owner }).pipe(Effect.provide(live)),
    );
    expect(listed.positions).toEqual([withFee]);
    expect(listed.receiptMints).toEqual([fixture.referral.receipt]);
    expect(withFee.amount).toBe("1000000000080274479");
    await seedKaminoAccount(surfnet.rpcUrl, fixture.referral.market, positionMarketBytes());
    try {
      const withoutFee = await Effect.runPromise(
        getLendPosition(input).pipe(
          Effect.provide(layer(referralRpc.url, fixture.referral.market)),
        ),
      );
      expect(withoutFee.amount).toBe("1000000000080274480");
    } finally {
      await seedKaminoAccount(
        surfnet.rpcUrl,
        fixture.referral.market,
        positionMarketBytes({ referralFeeBps: 37 }),
      );
    }
  });
  test("lists multiple positions, dedupes RPC records, and matches individual mint reads", async () => {
    const live = layer(duplicateRpc.url);
    const listed = await Effect.runPromise(listLendPositions({}).pipe(Effect.provide(live)));
    const first = await Effect.runPromise(
      getLendPosition({ mint: USDC_MINT, owner: fixture.owner }).pipe(Effect.provide(live)),
    );
    const second = await Effect.runPromise(
      getLendPosition({ mint: fixture.secondMint, owner: fixture.owner }).pipe(
        Effect.provide(live),
      ),
    );
    expect(listed.positions).toEqual(
      [first, second].toSorted((a, b) => a.instrument.localeCompare(b.instrument)),
    );
    expect(
      listed.positions.map((position) => position.amount).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(["20", "302"]);
    expect(listed.receiptMints).toEqual(fixture.receipts);
    expect(listed.perpAccounts).toEqual([]);
  });
  test("returns a complete empty enumeration for an owner with no obligations", async () => {
    await expect(
      Effect.runPromise(
        listLendPositions({ owner: fixture.emptyOwner }).pipe(
          Effect.provide(layer(duplicateRpc.url)),
        ),
      ),
    ).resolves.toEqual({ positions: [], perpAccounts: [], receiptMints: [] });
  });
  test("maps an obligation-scan RPC failure without exposing provider text", async () => {
    const error = await Effect.runPromise(
      listLendPositions({ owner: fixture.owner }).pipe(
        Effect.provide(layer(failingRpc.url)),
        Effect.flip,
      ),
    );
    expect(error).toMatchObject({
      _tag: "RpcError",
      method: "getProgramAccounts",
      reason: "the configured RPC endpoint failed the obligation scan",
    });
    expect(JSON.stringify(error)).not.toContain("secret provider failure");
  });
  test("maps a reserve decode failure to the published layout error", async () => {
    const error = await Effect.runPromise(
      listLendPositions({ owner: fixture.owner }).pipe(
        Effect.provide(layer(corruptRpc.url)),
        Effect.flip,
      ),
    );
    expect(error).toMatchObject({
      _tag: "LendingLayoutUnsupported",
      reason: "a reserve account has an unsupported layout",
    });
    expect(fixture.reserves).toContain(error.reserve);
  });
});
