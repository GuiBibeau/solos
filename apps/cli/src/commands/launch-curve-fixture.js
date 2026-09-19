// @ts-check
import { launchFixtureAccounts, randomCurveMint } from "@solos/solana/launch/fixture-accounts";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
export { runSolos, stderrJson } from "./swap-quote-fixture.js";

/**
 * Shared harness for the `solos launch curve` command tests: a recording loopback JSON-RPC
 * server serving the bonding-curve fixture family (fresh, partial, completed,
 * unsupported-quote, absent, plus the Global config), the child-process runner, and the child
 * env. Never contacts a public endpoint, and independent of Surfnet so every case is
 * deterministic.
 */

export { USDC_QUOTE_MINT } from "@solos/solana/launch/fixture-accounts";

export const FRESH_MINT = randomCurveMint();
export const PARTIAL_MINT = randomCurveMint();
export const COMPLETED_MINT = randomCurveMint();
export const UNSUPPORTED_QUOTE_MINT = randomCurveMint();
/** Never seeded anywhere: its PDA is absent, the CurveUnavailable case. */
export const ABSENT_MINT = randomCurveMint();

/** Synthetic credential used to prove provider failure text never reaches a client. */
export const CREDENTIAL = "qa-synthetic-rpc-credential";

export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

/** The expected LaunchCurve body for the fresh fixture. */
export const expectedFreshCurve = () => ({
  mint: FRESH_MINT,
  program: PUMP_PROGRAM,
  complete: false,
  progressBps: 0,
  virtualSolReserves: "30000000000",
  virtualTokenReserves: "1073000000000000",
});

/**
 * The expected LaunchCurve body for the partial fixture: the adapter suite's independently
 * derived 3500 bps vector, mirrored here against the same account bytes.
 */
export const expectedPartialCurve = () => ({
  mint: PARTIAL_MINT,
  program: PUMP_PROGRAM,
  complete: false,
  progressBps: 3500,
  virtualSolReserves: "30000000000",
  virtualTokenReserves: "1073000000000000",
});

/** The expected LaunchCurve body for the completed fixture: a successful, useful read. */
export const expectedCompletedCurve = () => ({
  mint: COMPLETED_MINT,
  program: PUMP_PROGRAM,
  complete: true,
  progressBps: 10_000,
  virtualSolReserves: "30000000000",
  virtualTokenReserves: "1073000000000000",
});

/** JSON-RPC endpoint answering `getAccountInfo` from an address map. @param {Map<string, { owner: string; data: Uint8Array } | null>} accounts */
const startRpcServer = (accounts) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const rpc = /** @type {{ id: number; params: [string, unknown] }} */ (await request.json());
      const account = accounts.get(rpc.params[0]) ?? null;
      const value =
        account === null
          ? null
          : {
              data: [Buffer.from(account.data).toString("base64"), "base64"],
              executable: false,
              lamports: 1_461_600,
              owner: account.owner,
              space: account.data.length,
            };
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: { context: { slot: 1 }, value },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** A JSON-RPC endpoint whose every answer is a provider error echoing a synthetic credential, on a URL that carries it in path and query. */
export const startLeakyServer = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32_603, message: `internal quota failure for key ${CREDENTIAL}` },
      }),
  });
  return {
    url: `http://127.0.0.1:${server.port}/qa/${CREDENTIAL}?api-key=${CREDENTIAL}`,
    stop: () => server.stop(true),
  };
};

/**
 * The loopback fixture server over the standard account map, plus the throwaway signer env
 * every CLI child needs. The signer is generated in-test and funds nothing.
 */
export const startLaunchFixture = async () => {
  const server = startRpcServer(
    await launchFixtureAccounts({
      fresh: FRESH_MINT,
      partial: PARTIAL_MINT,
      completed: COMPLETED_MINT,
      unsupportedQuote: UNSUPPORTED_QUOTE_MINT,
    }),
  );
  return {
    url: server.url,
    stop: () => server.stop(),
    env: async () => ({
      SOLANA_RPC_URL: server.url,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_LOG_LEVEL: "warn",
    }),
  };
};
