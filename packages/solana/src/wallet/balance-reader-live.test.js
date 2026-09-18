import { beforeAll, describe, expect, test } from "bun:test";
import { getBalances } from "@solos/core";
import { Effect } from "effect";
import { SolanaTestLive } from "../index.js";
import { KitSigner } from "../signer/kit-signer.js";
import { USDC_MINT, ensureSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

describe("wallet against Surfnet [integration]", () => {
  /** @type {ReturnType<typeof SolanaTestLive>} */
  let layer;
  /** @type {string} */
  let owner;
  /** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
  let surfnet;

  beforeAll(async () => {
    surfnet = await ensureSurfnet();
    layer = SolanaTestLive({ ...surfnet, seed: randomSeed() });
    owner = await Effect.runPromise(
      Effect.map(KitSigner, (k) => k.signer.address).pipe(Effect.provide(layer)),
    );
    await surfnet.cheats.fundSol(owner, 2);
    await surfnet.cheats.setMint(USDC_MINT, 6);
    await surfnet.cheats.setTokenAccount(owner, USDC_MINT, 5_000_000);
  });

  test("reads SOL and token balances of the configured signer", async () => {
    const balances = await Effect.runPromise(getBalances(undefined).pipe(Effect.provide(layer)));
    expect(balances.owner).toBe(owner);
    expect(balances.sol).toBe("2");
    expect(balances.lamports).toBe("2000000000");
    const usdc = balances.tokens.find((t) => t.mint === USDC_MINT);
    expect(usdc).toMatchObject({ program: "token", amount: "5000000", decimals: 6, uiAmount: "5" });
  });

  test("reads another wallet when owner is given", async () => {
    // A fixed address can hold real tokens on an online fork. Own the fixture instead.
    const other = await seedAddress(randomSeed());
    await surfnet.cheats.fundSol(other, 3);
    const balances = await Effect.runPromise(getBalances(other).pipe(Effect.provide(layer)));
    expect(balances.owner).toBe(other);
    expect(balances.sol).toBe("3");
    expect(balances.lamports).toBe("3000000000");
    expect(balances.tokens).toEqual([]);
  });
});
