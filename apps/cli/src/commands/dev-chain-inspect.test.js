// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { SolanaRpc, SolanaRpcLive } from "@solos/solana";
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { Effect } from "effect";
import {
  inspectAccount,
  inspectAccountData,
  inspectTransaction,
  transactionEvidence,
} from "./dev-chain-inspect.js";

let surfnet;
let owner;
let airdropSignature;
const rpc = (effect) =>
  Effect.runPromise(
    Effect.provide(Effect.flatMap(SolanaRpc, effect), SolanaRpcLive(surfnet.rpcUrl, surfnet.wsUrl)),
  );

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  owner = await seedAddress(randomSeed());
  airdropSignature = await surfnet.cheats.fundSol(owner, 0.01);
});

describe("read-only chain inspection via the Surfpool RPC adapter [integration]", () => {
  test("reports live account rent/size without returning account data", async () => {
    const account = await rpc((ctx) => inspectAccount(ctx, owner));
    expect(account).toMatchObject({ account: owner, exists: true, lamports: "10000000" });
    expect(account).toHaveProperty("dataBytes");
    const missing = await seedAddress(randomSeed());
    const absent = await rpc((ctx) => inspectAccount(ctx, missing));
    expect(absent).toEqual({ account: missing, exists: false });
  });

  test("explicit account-data inspection returns bounded public on-chain bytes", async () => {
    const result = await rpc((ctx) => inspectAccountData(ctx, owner));
    expect(result.account).toBe(owner);
    expect(result.owner).toBe("11111111111111111111111111111111");
    expect(result.dataBase64).toBe("");
  });

  test("reads the finalized transaction fee and lamport deltas", async () => {
    const tx = await rpc((ctx) => inspectTransaction(ctx, airdropSignature));
    expect(tx.signature).toBe(airdropSignature);
    expect(tx.error).toBeNull();
    expect(tx.accountDeltas.find((row) => row.account === owner)?.deltaLamports).toBe("10000000");
  });

  test("refuses mismatched transaction metadata instead of inventing rent", () => {
    const tx = {
      slot: 2n,
      meta: { fee: 5000n, err: null, preBalances: [0n], postBalances: [123n] },
      transaction: { message: { accountKeys: [owner, "11111111111111111111111111111111"] } },
    };
    expect(() => transactionEvidence(tx, airdropSignature)).toThrow("do not align");
    expect(
      transactionEvidence(
        { ...tx, transaction: { message: { accountKeys: [owner] } } },
        airdropSignature,
      ),
    ).toMatchObject({
      feeLamports: "5000",
      accountDeltas: [{ account: owner, deltaLamports: "123" }],
    });
  });
});
