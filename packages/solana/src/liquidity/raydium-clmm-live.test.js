// @ts-check
/**
 * The Raydium adapter through real RPC against a seeded offline Surfnet.
 *
 * The portfolio test stubs `LiquidityVenue`, so it proves the merge and nothing below it. This
 * exercises what that stub replaces: token-account selection, PDA derivation from candidate
 * mints, batching, pool decoding, custody, and receipt-mint mapping.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { createSolanaRpc } from "@solana/kit";
import { Cause, Effect, Option } from "effect";
import { TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { ensureOfflineSurfnet } from "../surfnet/test-surfnet.js";
import { randomAddress, seedTokenAccounts } from "./liquidity-seeds.js";
import { listRaydiumPositionsLive } from "./raydium-clmm-enumerate.js";
import { getRaydiumPositionLive } from "./raydium-clmm-read.js";
import { seedRaydiumPool, seedRaydiumPosition } from "./raydium-clmm-seeds.js";

/** Deterministic ordering for address-set comparisons. */
const byName = (/** @type {string} */ a, /** @type {string} */ b) => a.localeCompare(b);

/** @type {{ rpcUrl: string; read: any; pool: string }} */
let fx;

const run = (/** @type {any} */ effect) =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (exit._tag === "Success") return exit.value;
    const failure = Cause.failureOption(exit.cause);
    if (Option.isNone(failure)) throw new Error(String(exit.cause));
    return /** @type {any} */ (failure.value);
  });

beforeAll(async () => {
  const surfnet = await ensureOfflineSurfnet();
  const read = {
    rpc: createSolanaRpc(surfnet.rpcUrl),
    origin: rpcOrigin(surfnet.rpcUrl),
    timeoutMs: TOKEN_RPC_TIMEOUT_MS,
  };
  const pool = await seedRaydiumPool(surfnet.rpcUrl, {
    mint0: randomAddress(),
    mint1: randomAddress(),
  });
  fx = { rpcUrl: surfnet.rpcUrl, read, pool };
});

describe("raydium adapter over seeded Surfnet [integration]", () => {
  test("a seeded position reads back through the real adapter", async () => {
    const owner = randomAddress();
    const { position } = await seedRaydiumPosition(fx.rpcUrl, {
      poolId: fx.pool,
      owner,
      liquidity: 10n ** 12n,
    });
    const result = await run(
      getRaydiumPositionLive(fx.read, { protocol: "raydium", position, owner }),
    );
    expect(result).toMatchObject({
      kind: "lp",
      protocol: "raydium",
      position,
      instrument: fx.pool,
      liquidity: (10n ** 12n).toString(),
    });
    // Decimals come from the pool, not a separate mint read.
    expect(result.tokenA.decimals).toBe(9);
    expect(result.tokenB.decimals).toBe(6);
  });

  test("enumeration finds every seeded position and maps the receipt mints", async () => {
    const owner = randomAddress();
    const first = await seedRaydiumPosition(fx.rpcUrl, { poolId: fx.pool, owner, liquidity: 5n });
    const second = await seedRaydiumPosition(fx.rpcUrl, { poolId: fx.pool, owner });
    // An unrelated NFT whose position PDA is absent is a candidate, then skipped.
    await seedTokenAccounts(fx.rpcUrl, owner, 1);
    const result = await run(listRaydiumPositionsLive(fx.read, { protocol: "raydium", owner }));
    expect(result.positions).toHaveLength(2);
    expect(result.perpAccounts).toEqual([]);
    expect(result.receiptMints.toSorted(byName)).toEqual(
      [first.nftMint, second.nftMint].toSorted(byName),
    );
  });

  test("a wallet with no positions enumerates empty rather than failing", async () => {
    const result = await run(
      listRaydiumPositionsLive(fx.read, { protocol: "raydium", owner: randomAddress() }),
    );
    expect(result).toMatchObject({ positions: [], perpAccounts: [], receiptMints: [] });
  });

  test("a foreign-owned position account fails the whole enumeration, never partially", async () => {
    const owner = randomAddress();
    await seedRaydiumPosition(fx.rpcUrl, { poolId: fx.pool, owner, liquidity: 5n });
    await seedRaydiumPosition(fx.rpcUrl, {
      poolId: fx.pool,
      owner,
      accountOwner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    });
    const result = await run(listRaydiumPositionsLive(fx.read, { protocol: "raydium", owner }));
    expect(result._tag).toBe("LiquidityPositionUnavailable");
    expect(result.reason).toContain("not owned by the pinned Raydium CLMM program");
  });

  // The gap Codex found: enumeration decoded a pool without the ownership check the point read
  // does, so discriminator-shaped bytes in a foreign account became fabricated mints.
  test("a foreign-owned pool fails enumeration rather than yielding fabricated mints", async () => {
    const owner = randomAddress();
    const impostor = await seedRaydiumPool(fx.rpcUrl, {
      mint0: randomAddress(),
      mint1: randomAddress(),
      accountOwner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    });
    await seedRaydiumPosition(fx.rpcUrl, { poolId: impostor, owner, liquidity: 5n });
    const result = await run(listRaydiumPositionsLive(fx.read, { protocol: "raydium", owner }));
    expect(result._tag).toBe("LiquidityPositionUnavailable");
    expect(result.reason).toContain("pool is not owned by the pinned Raydium CLMM program");
  });

  test("a transferred NFT reads as unavailable, not as someone else's position", async () => {
    const owner = randomAddress();
    const { position } = await seedRaydiumPosition(fx.rpcUrl, { poolId: fx.pool, owner });
    const result = await run(
      getRaydiumPositionLive(fx.read, {
        protocol: "raydium",
        position,
        owner: randomAddress(),
      }),
    );
    expect(result._tag).toBe("LiquidityPositionUnavailable");
    expect(result.reason).toBe("owner does not hold the position NFT");
  });
});
