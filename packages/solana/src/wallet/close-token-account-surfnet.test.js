// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { address, none, some } from "@solana/kit";
import { getMintEncoder, getTokenEncoder } from "@solana-program/token";
import {
  BuildRejected,
  EventBusInMemory,
  executeCloseTokenAccount,
  simulateCloseTokenAccount,
} from "@solos/core";
import { Cause, Effect, Layer, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import {
  ensureOfflineSurfnet,
  randomSeed,
  seedAddress,
  surfnetCheatcodes,
  USDC_MINT,
} from "../surfnet/index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./parse-token-accounts.js";

/**
 * Closing token accounts through the real executor and Submission against an offline Surfnet.
 * Accounts are written byte-exact with `surfnet_setAccount`, so a funded wrapped-SOL account, a
 * frozen account and a foreign close authority are exactly what the Token program sees; the
 * close itself runs the real Token and Token-2022 programs.
 */

const WSOL_MINT = "So11111111111111111111111111111111111111112";
/** Rent-exempt minimum for a 165-byte token account. */
const RENT = 2_039_280n;
const tokenEncoder = getTokenEncoder();
const mintEncoder = getMintEncoder();

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** @type {Uint8Array} */
let seed;
/** @type {string} */
let signer;
/** A Token-2022 mint, so a Token-2022 account names a mint its own program owns. */
/** @type {string} */
let mint2022;

/**
 * @param {{ mint?: string; owner?: string; amount?: bigint; native?: boolean;
 *   program?: string; closeAuthority?: string; state?: number }} [shape]
 */
const seedTokenAccount = async (shape = {}) => {
  const account = await seedAddress(randomSeed());
  const isNative = shape.native === true;
  const amount = shape.amount ?? 0n;
  const bytes = tokenEncoder.encode({
    mint: address(shape.mint ?? USDC_MINT),
    owner: address(shape.owner ?? signer),
    amount,
    delegate: none(),
    state: shape.state ?? 1,
    isNative: isNative ? some(RENT) : none(),
    delegatedAmount: 0n,
    closeAuthority: shape.closeAuthority ? some(address(shape.closeAuthority)) : none(),
  });
  await jsonRpc(surfnet.rpcUrl, "surfnet_setAccount", [
    account,
    {
      lamports: Number(RENT + (isNative ? amount : 0n)),
      data: Buffer.from(bytes).toString("hex"),
      owner: shape.program ?? TOKEN_PROGRAM,
      executable: false,
    },
  ]);
  return account;
};

/** Surfpool resolves a token account's mint when it records a send, so every mint must exist.
 * @param {string} mint @param {string} program */
const seedMint = (mint, program) =>
  jsonRpc(surfnet.rpcUrl, "surfnet_setAccount", [
    mint,
    {
      lamports: 1_461_600,
      data: Buffer.from(
        mintEncoder.encode({
          mintAuthority: none(),
          supply: 0n,
          decimals: 6,
          isInitialized: true,
          freezeAuthority: none(),
        }),
      ).toString("hex"),
      owner: program,
      executable: false,
    },
  ]);

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  seed = randomSeed();
  signer = await seedAddress(seed);
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  await cheats.fundSol(signer, 1);
  await cheats.ensureMint(USDC_MINT, 6);
  mint2022 = await seedAddress(randomSeed());
  await seedMint(mint2022, TOKEN_2022_PROGRAM);
});

afterAll(() => {
  rpc.stop();
});

const layer = () =>
  Layer.merge(SolanaTestLive({ rpcUrl: rpc.url, wsUrl: surfnet.wsUrl, seed }), EventBusInMemory);

/** @param {Effect.Effect<any, any, any>} effect */
const run = (effect) => Effect.runPromise(Effect.provide(effect, layer()));

/** @param {Effect.Effect<any, any, any>} effect */
const failureOf = async (effect) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer()));
  if (exit._tag !== "Failure") throw new Error("expected a domain failure");
  return Option.getOrThrow(Cause.failureOption(exit.cause));
};

/** @param {string} account */
const lamportsOf = async (account) => {
  const { value } = await jsonRpc(surfnet.rpcUrl, "getAccountInfo", [
    account,
    { encoding: "base64" },
  ]);
  return value === null ? null : BigInt(value.lamports);
};

describe("closing a token account through Submission [integration]", () => {
  test("an empty account closes and its rent returns to the signer", async () => {
    const account = await seedTokenAccount();
    const simulated = await run(simulateCloseTokenAccount({ account }));
    expect(simulated.venueQuote).toMatchObject({
      kind: "token_account_close",
      account,
      mint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM,
      returnedLamports: RENT.toString(),
      unwrappedLamports: "0",
    });
    const before = /** @type {bigint} */ (await lamportsOf(signer));
    const executed = await run(executeCloseTokenAccount({ account }));
    expect(executed.status).toBe("confirmed");
    expect(executed.simulated).toBe(true);
    expect(await lamportsOf(account)).toBeNull();
    const gained = /** @type {bigint} */ (await lamportsOf(signer)) - before;
    expect(gained).toBeGreaterThan(RENT - 20_000n);
    expect(gained).toBeLessThanOrEqual(RENT);
  });

  test("the wrapped-SOL account unwraps its whole balance to native SOL", async () => {
    const account = await seedTokenAccount({ mint: WSOL_MINT, native: true, amount: 5_000_000n });
    const simulated = await run(simulateCloseTokenAccount({ account }));
    expect(simulated.venueQuote).toMatchObject({
      returnedLamports: (RENT + 5_000_000n).toString(),
      unwrappedLamports: "5000000",
    });
    const before = /** @type {bigint} */ (await lamportsOf(signer));
    await run(executeCloseTokenAccount({ account }));
    expect(await lamportsOf(account)).toBeNull();
    const gained = /** @type {bigint} */ (await lamportsOf(signer)) - before;
    expect(gained).toBeGreaterThan(RENT + 5_000_000n - 20_000n);
  });

  test("an empty Token-2022 account closes against Token-2022, read from its owner", async () => {
    const account = await seedTokenAccount({ mint: mint2022, program: TOKEN_2022_PROGRAM });
    const simulated = await run(simulateCloseTokenAccount({ account }));
    expect(simulated.venueQuote).toMatchObject({ tokenProgram: TOKEN_2022_PROGRAM });
    await run(executeCloseTokenAccount({ account }));
    expect(await lamportsOf(account)).toBeNull();
  });

  const refusals = /** @type {const} */ ([
    ["holds a balance", { amount: 1n }, "still holds 1 base units"],
    ["belongs to another wallet", { owner: "Stranger" }, "does not own"],
    ["is frozen", { state: 2 }, "frozen"],
    ["has another close authority", { closeAuthority: "Stranger" }, "close authority"],
  ]);

  for (const [label, shape, expected] of refusals) {
    test(`an account that ${label} is refused before simulation, with zero sends`, async () => {
      const stranger = await seedAddress(randomSeed());
      const resolved = Object.fromEntries(
        Object.entries(shape).map(([key, value]) => [key, value === "Stranger" ? stranger : value]),
      );
      const account = await seedTokenAccount(resolved);
      const sims = rpc.callsFor("simulateTransaction").length;
      const sends = rpc.callsFor("sendTransaction").length;
      const failure = await failureOf(executeCloseTokenAccount({ account }));
      expect(failure).toBeInstanceOf(BuildRejected);
      expect(/** @type {BuildRejected} */ (failure).reason).toContain(expected);
      expect(/** @type {BuildRejected} */ (failure).reason).toContain("nothing was signed");
      expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
      expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    });
  }

  test("a balance refusal says how to fix it", async () => {
    const account = await seedTokenAccount({ amount: 7n });
    const failure = await failureOf(simulateCloseTokenAccount({ account }));
    expect(/** @type {BuildRejected} */ (failure).remedy).toContain("that balance first");
  });

  test("an account that is not a token account, or does not exist, is refused", async () => {
    const system = await failureOf(simulateCloseTokenAccount({ account: signer }));
    expect(/** @type {BuildRejected} */ (system).reason).toContain("not a Token or Token-2022");
    const missing = await seedAddress(randomSeed());
    const absent = await failureOf(simulateCloseTokenAccount({ account: missing }));
    expect(/** @type {BuildRejected} */ (absent).reason).toContain("does not exist");
  });
});
