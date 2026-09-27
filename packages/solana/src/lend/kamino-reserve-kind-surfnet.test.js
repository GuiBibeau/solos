// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  address,
  getAddressEncoder,
  getBase58Codec,
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";
import { BuildRejected, SimulationFailed, simulateLendDeposit } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import {
  ensureOfflineSurfnet,
  randomSeed,
  seedAddress,
  surfnetCheatcodes,
  USDC_MINT,
} from "../surfnet/index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { TOKEN_PROGRAM } from "../wallet/parse-token-accounts.js";
import {
  positionMarketBytes,
  positionReserveBytes,
  seedKaminoAccount,
} from "./kamino-position-fixture.js";

/**
 * A Kamino market can carry a fixed-term debt reserve beside the float-rate reserve for the same
 * mint; mainnet's Main Market did for USDC in the 2026-09-27 live round. The deposit must plan
 * against the float-rate reserve the reads advertise, whatever order the scan returns.
 */

const addressEncoder = getAddressEncoder();
/** Pinned Reserve layout offsets: `liquidity.tokenProgram` and `config.debtTermSeconds`. */
const TOKEN_PROGRAM_OFFSET = 408;
const DEBT_TERM_SECONDS_OFFSET = 5784;
const THIRTY_DAYS = 2_592_000n;
const receipt = getBase58Codec().decode(new Uint8Array(32).fill(7));

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** @type {Uint8Array} */
let signerSeed;

/** @param {string} market @param {{ termSeconds?: bigint }} [kind] */
const reserveBytes = (market, kind = {}) => {
  const bytes = positionReserveBytes({
    market,
    mint: USDC_MINT,
    receiptMint: receipt,
    available: 10n ** 12n,
    collateralSupply: 10n ** 12n,
    decimals: 6,
  });
  bytes.set(addressEncoder.encode(address(TOKEN_PROGRAM)), TOKEN_PROGRAM_OFFSET);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setBigUint64(DEBT_TERM_SECONDS_OFFSET, kind.termSeconds ?? 0n, true);
  return bytes;
};

/** Byte-wise order of two addresses, as a key-ordered scan would see them.
 * @param {string} left @param {string} right */
const isLowerAddress = (left, right) => {
  const a = addressEncoder.encode(address(left));
  const b = addressEncoder.encode(address(right));
  const at = a.findIndex((byte, index) => byte !== b[index]);
  return at !== -1 && (a[at] ?? 0) < (b[at] ?? 0);
};

/** Two fresh addresses, lowest bytes first; seeded in that order too, so a scan in either key or
 * insertion order returns the first one first. */
const orderedPair = async () => {
  const [a, b] = await Promise.all([seedAddress(randomSeed()), seedAddress(randomSeed())]);
  return isLowerAddress(a, b) ? [a, b] : [b, a];
};

/** Seed a fresh market, then each reserve in the given order. @param {Array<{ address: string; termSeconds?: bigint }>} reserves */
const seedMarket = async (reserves) => {
  const market = await seedAddress(randomSeed());
  await seedKaminoAccount(surfnet.rpcUrl, market, positionMarketBytes());
  for (const reserve of reserves) {
    await seedKaminoAccount(surfnet.rpcUrl, reserve.address, reserveBytes(market, reserve));
  }
  return market;
};

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  signerSeed = randomSeed();
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  await cheats.ensureMint(USDC_MINT, 6);
  await cheats.setMint(receipt, 6);
  await cheats.setTokenAccount(await seedAddress(signerSeed), USDC_MINT, 10n ** 9n);
});

afterAll(() => {
  rpc.stop();
});

/** @param {string} market */
const failureIn = async (market) => {
  const layer = SolanaTestLive({
    rpcUrl: rpc.url,
    wsUrl: surfnet.wsUrl,
    seed: signerSeed,
    kamino: { market },
  });
  const exit = await Effect.runPromiseExit(
    Effect.provide(simulateLendDeposit({ mint: USDC_MINT, amount: "1000000" }), layer),
  );
  if (exit._tag !== "Failure") throw new Error("expected a domain failure on the offline fork");
  return Option.getOrThrow(Cause.failureOption(exit.cause));
};

/** The static accounts of the last transaction solOS asked the node to simulate. */
const lastSimulatedAccounts = () => {
  const wire = /** @type {string} */ (rpc.callsFor("simulateTransaction").at(-1)?.params[0]);
  const transaction = getTransactionDecoder().decode(getBase64Codec().encode(wire));
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  return compiled.staticAccounts.map(String);
};

describe("kamino deposit picks the float-rate reserve by kind [integration]", () => {
  test("a fixed-term reserve for the same mint, scanned first, is never planned against", async () => {
    const [term, float] = await orderedPair();
    const market = await seedMarket([
      { address: term, termSeconds: THIRTY_DAYS },
      { address: float },
    ]);
    const failure = await failureIn(market);
    // The synthetic program cannot run the deposit, so reaching simulation is the pass.
    expect(failure).toBeInstanceOf(SimulationFailed);
    const accounts = lastSimulatedAccounts();
    expect(accounts).toContain(float);
    expect(accounts).not.toContain(term);
  });

  test("two float-rate reserves for one mint are refused as ambiguous before signing", async () => {
    const [first, second] = await orderedPair();
    const market = await seedMarket([{ address: first }, { address: second }]);
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureIn(market);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure).reason).toContain("more than one float-rate");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("a mint with only a fixed-term reserve has no float-rate reserve to deposit into", async () => {
    const [term] = await orderedPair();
    const market = await seedMarket([{ address: term, termSeconds: THIRTY_DAYS }]);
    const failure = await failureIn(market);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure).reason).toContain("no float-rate reserve");
  });
});
