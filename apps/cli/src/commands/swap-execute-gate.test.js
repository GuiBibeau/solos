// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet, randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { startRpcRecorder } from "@solos/solana/surfnet/rpc-recorder";
import { AMOUNT, INPUT_MINT, KEY, OUTPUT_MINT } from "@solos/solana/swap/build-bodies";
import { startBuildFixture } from "@solos/solana/swap/build-http-fixture";
import { runSolos, solanaEnv, stderrJson } from "./swap-quote-fixture.js";

const swapArgs = ["--input-mint", INPUT_MINT, "--output-mint", OUTPUT_MINT, "--amount", AMOUNT];
/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startBuildFixture>} */
let fixture;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fixture = startBuildFixture();
  rpc = startRpcRecorder(surfnet.rpcUrl);
});

afterAll(() => {
  fixture?.stop();
  rpc?.stop();
});

const childEnv = async () => ({
  ...(await solanaEnv(surfnet)),
  SOLANA_RPC_URL: rpc.url,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  JUPITER_API_KEY: KEY,
  JUPITER_BASE_URL: fixture.url,
});

describe("default swap execution gates through real child processes [integration]", () => {
  test("native execute fails simulation after one build and sends nothing", async () => {
    const builds = fixture.requests.length;
    const sends = rpc.callsFor("sendTransaction").length;
    const { stderr, code } = await runSolos(["swap", "execute", ...swapArgs], await childEnv());

    expect(code).toBe(1);
    expect(stderrJson(stderr)?.error?.code).toBe("SimulationFailed");
    expect(fixture.requests.length).toBe(builds + 1);
    expect(rpc.callsFor("sendTransaction")).toHaveLength(sends);
  });

  test("stdio MCP execute uses the default simulation gate and sends nothing", async () => {
    const builds = fixture.requests.length;
    const sends = rpc.callsFor("sendTransaction").length;
    const args = JSON.stringify({ inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: AMOUNT });
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_swap_execute_swap", "--args", args],
      await childEnv(),
    );

    expect(code).toBe(1);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.code).toBe("SimulationFailed");
    expect(fixture.requests.length).toBe(builds + 1);
    expect(rpc.callsFor("sendTransaction")).toHaveLength(sends);
  });
});
