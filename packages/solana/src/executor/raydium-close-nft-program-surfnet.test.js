// @ts-check
/**
 * Which token program a `close_position` names for the position NFT, proved on the wire.
 *
 * Raydium has two open instructions and they mint the NFT under different token programs:
 * `open_position_v2` mints a classic SPL one — most positions in existence — and the Token-2022
 * form solOS opens with mints a Token-2022 one. The program checks the account against whichever
 * one really owns the mint, so naming the wrong one makes an empty position impossible to close.
 *
 * Every simulation here fails, because the seeded pool is not a real program. That is exactly why
 * these assert on the bytes solOS sent rather than on the outcome: a `SimulationFailed` verdict
 * cannot tell a wrong token program apart from a fork that cannot run Raydium at all, so a test
 * that asserts only the verdict passes whatever the builder put in that account.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  decompileTransactionMessage,
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";
import { SimulationFailed, simulateClosePosition } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { randomAddress } from "../liquidity/liquidity-seeds.js";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../liquidity/raydium-clmm-instruction.js";
import { CLOSE_POSITION_DISCRIMINATOR } from "../liquidity/raydium-clmm-open.js";
import { RAYDIUM_CLMM_PROGRAM } from "../liquidity/raydium-clmm-program.js";
import { seedRaydiumPool, seedRaydiumPosition } from "../liquidity/raydium-clmm-seeds.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
});

afterAll(() => {
  rpc.stop();
});

/**
 * Seed an emptied position whose NFT sits under one token program, then simulate its close and
 * hand back the accounts of the Raydium instruction that actually reached the RPC.
 * @param {string} nftProgram
 */
const closeWireFor = async (nftProgram) => {
  const seed = randomSeed();
  const owner = await seedAddress(seed);
  const pool = await seedRaydiumPool(surfnet.rpcUrl, {
    mint0: randomAddress(),
    mint1: randomAddress(),
    tickSpacing: 60,
  });
  const { position } = await seedRaydiumPosition(surfnet.rpcUrl, {
    poolId: pool,
    owner,
    liquidity: 0n,
    nftProgram,
  });
  const exit = await Effect.runPromiseExit(
    Effect.provide(
      simulateClosePosition({ protocol: "raydium", position }),
      SolanaTestLive({ rpcUrl: rpc.url, wsUrl: surfnet.wsUrl, seed }),
    ),
  );
  if (exit._tag !== "Failure") throw new Error("expected the offline fork to refuse the close");
  const failure = Cause.failureOption(exit.cause);
  // A build that never reaches simulation leaves no wire to read, so this is asserted here
  // rather than left to a missing-call error further down.
  expect(Option.getOrUndefined(failure)).toBeInstanceOf(SimulationFailed);
  return { owner, accounts: raydiumAccountsOfLastSimulation() };
};

/** The accounts of the one Raydium instruction in the most recently simulated wire. */
const raydiumAccountsOfLastSimulation = () => {
  const call = rpc.callsFor("simulateTransaction").at(-1);
  const wire = getBase64Codec().encode(/** @type {string} */ (call?.params[0]));
  const transaction = getTransactionDecoder().decode(wire);
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const message = decompileTransactionMessage(
    /** @type {Parameters<typeof decompileTransactionMessage>[0]} */ (
      /** @type {unknown} */ (compiled)
    ),
  );
  const close = message.instructions.find((ix) => ix.programAddress === RAYDIUM_CLMM_PROGRAM);
  if (close === undefined) throw new Error("the simulated wire carried no Raydium instruction");
  expect(close.data?.slice(0, 8)).toEqual(Uint8Array.from(CLOSE_POSITION_DISCRIMINATOR));
  return [...(close.accounts ?? [])].map((account) => String(account.address));
};

describe("the token program a raydium close names over Surfnet [integration]", () => {
  // The case the hard-coded value broke: a position solOS did not open, which is most of them.
  test("a legacy classic-SPL position is closed against the classic token program", async () => {
    const { owner, accounts } = await closeWireFor(TOKEN_PROGRAM);
    expect(accounts).toHaveLength(6);
    expect(accounts[5]).toBe(TOKEN_PROGRAM);
    expect(accounts[4]).toBe(SYSTEM_PROGRAM);
    expect(accounts[0]).toBe(owner);
  });

  test("a position solOS opened itself is still closed against token-2022", async () => {
    const { owner, accounts } = await closeWireFor(TOKEN_2022_PROGRAM);
    expect(accounts).toHaveLength(6);
    expect(accounts[5]).toBe(TOKEN_2022_PROGRAM);
    expect(accounts[4]).toBe(SYSTEM_PROGRAM);
    expect(accounts[0]).toBe(owner);
  });
});
