// @ts-check
/**
 * A multi-hop build reaching the chain through the real preflight.
 *
 * Relaxing the setup validator's mint allowlist is not enough on its own: `ownerBindingRejection`
 * compares every ATA create's token program against the mint's discovered on-chain owner, and
 * owner discovery used to cover only the requested pair. An intermediate mint resolved to
 * `undefined` and the build was refused anyway, one check later. A `buildRejection` unit test
 * cannot see that — it stops before preflight — so this drives the executor through a real RPC.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { getBase64Codec } from "@solana/kit";
import { ActionExecutor, EventBusInMemory } from "@solos/core";
import { Effect, Layer } from "effect";
import { SolanaTestLive } from "../index.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { AMOUNT, INPUT_MINT, KEY, OUTPUT_MINT } from "../swap/jupiter-swap-build-bodies.js";
import { buildEnvelope } from "../swap/jupiter-swap-build-fixture.js";
import { startBuildFixture } from "../swap/jupiter-swap-build-http-fixture.js";
import { derivedAta } from "../swap/jupiter-swap-build-setup-account.js";
import { ATA_PROGRAM, SYSTEM_PROGRAM, TOKEN_PROGRAM } from "../swap/jupiter-swap-build-validate.js";

/** A real mainnet intermediate token: Jupiter routes SOL into USDC through it. */
const USD1 = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";
const BLOCKHASH = "11111111111111111111111111111111";

/** @type {Array<() => void>} */
const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** Every mint the build names exists on chain under the classic token program. */
const accountInfo = () => ({
  context: { slot: 1 },
  value: {
    data: ["", "base64"],
    executable: false,
    lamports: 1_461_600,
    owner: TOKEN_PROGRAM,
    rentEpoch: 0,
    space: 82,
  },
});

/** @param {string[]} knownMints */
const startRpc = (knownMints) => {
  /** @type {string[]} */
  const seen = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const payload = /** @type {{ id: unknown; method: string; params: Array<unknown> }} */ (
        await request.json()
      );
      seen.push(payload.method);
      const result = (() => {
        if (payload.method === "getAccountInfo") {
          const key = String(payload.params[0]);
          // The taker's temporary wSOL account must be absent for the cleanup check.
          return knownMints.includes(key) ? accountInfo() : { context: { slot: 1 }, value: null };
        }
        if (payload.method === "getLatestBlockhash") {
          return { context: { slot: 1 }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 9 } };
        }
        // Past the lifetime gate, then stop: reaching simulation is the whole assertion.
        if (payload.method === "getBlockHeight") return 1;
        return null;
      })();
      return Response.json({ jsonrpc: "2.0", id: payload.id, result });
    },
  });
  stops.push(() => server.stop(true));
  return { seen, url: `http://127.0.0.1:${server.port}` };
};

/** The documented envelope plus the ATA create a USD1 hop would carry. */
/** @param {string} taker */
const withIntermediateCreate = async (taker) => {
  const envelope = await buildEnvelope({ taker });
  const account = await derivedAta(taker, USD1, TOKEN_PROGRAM);
  const create = {
    programId: ATA_PROGRAM,
    accounts: [
      { pubkey: taker, isWritable: true, isSigner: true },
      { pubkey: account, isWritable: true, isSigner: false },
      { pubkey: taker, isWritable: false, isSigner: false },
      { pubkey: USD1, isWritable: false, isSigner: false },
      { pubkey: SYSTEM_PROGRAM, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM, isWritable: false, isSigner: false },
    ],
    data: getBase64Codec().decode(Uint8Array.of(1)),
  };
  return { ...envelope, setupInstructions: [...envelope.setupInstructions, create] };
};

describe("multi-hop setup through the real preflight [integration]", () => {
  test("an intermediate mint's owner is discovered, so the build is not refused", async () => {
    const seed = randomSeed();
    const rpc = startRpc([INPUT_MINT, OUTPUT_MINT, USD1]);
    // The responder answers for whichever taker the executor asks about, so the derived USD1
    // account in the create matches the signer this layer builds.
    const build = startBuildFixture({
      responder: (params) => withIntermediateCreate(String(params.get("taker"))),
    });
    stops.push(build.stop);
    const layer = Layer.merge(
      SolanaTestLive({
        rpcUrl: rpc.url,
        wsUrl: "ws://127.0.0.1:1",
        seed,
        jupiter: { baseUrl: build.url, apiKey: KEY },
      }),
      EventBusInMemory,
    );
    const action = {
      type: /** @type {const} */ ("swap"),
      inputMint: INPUT_MINT,
      outputMint: OUTPUT_MINT,
      amount: AMOUNT,
      maxSlippageBps: 50,
    };
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(ActionExecutor, (executor) => executor.simulate(action)).pipe(
        Effect.provide(layer),
      ),
    );

    // Whatever happens next, it must not be the owner binding refusing an undiscovered mint.
    const text = JSON.stringify(exit);
    expect(text).not.toContain("token program");
    expect(text).not.toContain("requested swap mints");
    // Proof the extra mint was actually looked up rather than skipped.
    expect(rpc.seen.filter((method) => method === "getAccountInfo").length).toBeGreaterThanOrEqual(
      4,
    );
  });
});
