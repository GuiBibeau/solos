// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { EventBusInMemory, sendSol } from "@solos/core";
import { KitSigner, SolanaRpc, SolanaRpcLive, SolanaTestLive } from "@solos/solana";
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { Effect, Layer } from "effect";
import {
  inspectAccount,
  inspectAccountData,
  inspectNetwork,
  inspectSignature,
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
  test("reads genesis identity and finalized progress without disclosing the RPC URL", async () => {
    const result = await rpc((ctx) => inspectNetwork(ctx));
    expect(result.genesisHash).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(result.finalizedSlot).toMatch(/^\d+$/);
    expect(result).not.toHaveProperty("url");
    expect(result).not.toHaveProperty("rpcUrl");
  });

  test("reports live account rent/size without returning account data", async () => {
    const account = await rpc((ctx) => inspectAccount(ctx, owner));
    expect(account).toMatchObject({
      account: owner,
      exists: true,
      lamports: "10000000",
    });
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

  test("bounds optional large public fixtures to two mebibytes", async () => {
    const result = await rpc((ctx) => inspectAccountData(ctx, owner, 2_000_000));
    expect(result.account).toBe(owner);
    await expect(rpc((ctx) => inspectAccountData(ctx, owner, 2_097_153))).rejects.toThrow();
  });

  test("reads the finalized transaction fee and lamport deltas", async () => {
    const tx = await rpc((ctx) => inspectTransaction(ctx, airdropSignature));
    expect(tx.signature).toBe(airdropSignature);
    expect(tx.error).toBeNull();
    expect(tx.accountDeltas.find((row) => row.account === owner)?.deltaLamports).toBe("10000000");
  });

  test("distinguishes landed signatures from unknown signatures without claiming expiry", async () => {
    const layer = Layer.merge(SolanaTestLive({ ...surfnet, seed: randomSeed() }), EventBusInMemory);
    const sender = await Effect.runPromise(
      Effect.provide(
        Effect.map(KitSigner, (kit) => kit.signer.address),
        layer,
      ),
    );
    await surfnet.cheats.fundSol(sender, 0.01);
    const receipt = await Effect.runPromise(
      Effect.provide(sendSol({ to: owner, amountSol: "0.001", skipSimulation: false }), layer),
    );
    const landed = await rpc((ctx) => inspectSignature(ctx, receipt.signature));
    expect(landed.found).toBe(true);
    expect(landed.error).toBeNull();
    expect(landed.finalizedBlockHeight).toMatch(/^\d+$/);
    expect(landed.freshLastValidBlockHeight).toMatch(/^\d+$/);
    const missingSignature = `${receipt.signature.slice(0, -1)}${receipt.signature.endsWith("1") ? "2" : "1"}`;
    const unknown = await rpc((ctx) => inspectSignature(ctx, missingSignature));
    expect(unknown.found).toBe(false);
    expect(unknown.confirmationStatus).toBeNull();
    expect(unknown).not.toHaveProperty("expired");
  });

  test("refuses mismatched transaction metadata instead of inventing rent", () => {
    const tx = {
      slot: 2n,
      meta: { fee: 5000n, err: null, preBalances: [0n], postBalances: [123n] },
      transaction: {
        message: { accountKeys: [owner, "11111111111111111111111111111111"] },
      },
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
