// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import {
  positionMarketBytes,
  positionObligationBytes,
  positionReserveBytes,
  seedKaminoAccount,
} from "@solos/solana/lend/position-fixture";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
  USDC_MINT,
} from "@solos/solana/surfnet";
import { runSolos } from "./cli-fixture.js";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */ let surfnet;
/** @type {Record<string, string>} */ let env;
/** @type {{ market: string; owner: string; emptyOwner: string; singleOwner: string; corruptOwner: string; single: string; corrupt: string; obligations: string[] }} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  const signerSeed = randomSeed();
  const [
    market,
    reserve,
    receipt,
    first,
    second,
    emptyOwner,
    singleOwner,
    single,
    corruptOwner,
    corrupt,
  ] = await Promise.all(Array.from({ length: 10 }, () => seedAddress(randomSeed())));
  const owner = await seedAddress(signerSeed);
  env = {
    SOLANA_RPC_URL: surfnet.rpcUrl,
    SOLANA_WS_URL: surfnet.wsUrl,
    SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(signerSeed),
    KAMINO_LENDING_MARKET: market,
  };
  await seedKaminoAccount(surfnet.rpcUrl, market, positionMarketBytes());
  await seedKaminoAccount(
    surfnet.rpcUrl,
    reserve,
    positionReserveBytes({
      market,
      mint: USDC_MINT,
      receiptMint: receipt,
      available: 1000n,
      collateralSupply: 500n,
      decimals: 6,
    }),
  );
  await seedKaminoAccount(
    surfnet.rpcUrl,
    first,
    positionObligationBytes({
      market,
      owner,
      deposits: [
        { reserve, amount: 100n },
        { reserve, amount: 25n },
      ],
      borrowReserve: reserve,
    }),
  );
  await seedKaminoAccount(
    surfnet.rpcUrl,
    second,
    positionObligationBytes({ market, owner, deposits: [{ reserve, amount: 26n }] }),
  );
  await seedKaminoAccount(
    surfnet.rpcUrl,
    single,
    positionObligationBytes({ market, owner: singleOwner, deposits: [{ reserve, amount: 5n }] }),
  );
  const corruptBytes = positionObligationBytes({
    market,
    owner: corruptOwner,
    deposits: [{ reserve, amount: 1n }],
  }).slice(0, 200);
  await seedKaminoAccount(surfnet.rpcUrl, corrupt, corruptBytes);
  fixture = {
    market,
    owner,
    emptyOwner,
    singleOwner,
    corruptOwner,
    single,
    corrupt,
    obligations: [first, second].toSorted((a, b) => a.localeCompare(b)),
  };
});

describe("`solos lend position` and real stdio MCP [integration]", () => {
  test("native CLI defaults owner to signer and aggregates every distinct obligation", async () => {
    const result = await runSolos(["lend", "position", "--mint", USDC_MINT], env);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: "lend",
      amount: "302",
      decimals: 6,
      market: fixture.market,
      positions: fixture.obligations,
    });
  });

  test("explicit zero owner is honored and returns a successful zero", async () => {
    const result = await runSolos(
      ["lend", "position", "--mint", USDC_MINT, "--owner", fixture.emptyOwner],
      env,
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ amount: "0", positions: [] });
  });

  test("an explicit owner with one obligation returns that identity once", async () => {
    const result = await runSolos(
      ["lend", "position", "--mint", USDC_MINT, "--owner", fixture.singleOwner],
      env,
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ amount: "10", positions: [fixture.single] });
  });

  test("actual stdio MCP returns the same exact owner position", async () => {
    const args = JSON.stringify({ mint: USDC_MINT, owner: fixture.owner });
    const result = await runSolos(["mcp", "call", "solana_lend_get_position", "--args", args], env);
    expect(result.code).toBe(0);
    const response = JSON.parse(result.stdout);
    expect(response.structuredContent).toMatchObject({
      amount: "302",
      positions: fixture.obligations,
    });
  });

  test("a matching corrupt obligation fails typed instead of disappearing", async () => {
    const args = JSON.stringify({ mint: USDC_MINT, owner: fixture.corruptOwner });
    const result = await runSolos(["mcp", "call", "solana_lend_get_position", "--args", args], env);
    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.stdout).structuredContent).toMatchObject({
      code: "LendingObligationInvalid",
      obligation: fixture.corrupt,
    });
  });
});
