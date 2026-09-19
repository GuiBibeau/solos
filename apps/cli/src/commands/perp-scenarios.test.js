// @ts-check
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTHORITY,
  OTHER_AUTHORITY,
  coldState,
  flatState,
  multiMarketState,
  shortState,
} from "@solos/solana/perp/phoenix-scenarios";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { runSolos } from "./cli-fixture.js";
import { signerEnv, startPerpFixture } from "./perp-fixture.js";

/**
 * CLI child-process mirrors of the adapter suite's short, flat, absent-trader, and
 * multi-market reads. Long and unknown-market stay in `perp.test.js`.
 */

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startPerpFixture> | undefined} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
});

afterEach(() => {
  fixture?.stop();
  fixture = undefined;
});

const runPosition = async (args, script) => {
  fixture = startPerpFixture(script);
  const { env } = await signerEnv(surfnet, fixture.url);
  return runSolos(["perp", "position", ...args], env);
};

describe("`solos perp position` scenario reads [integration]", () => {
  test("a short keeps direction in the side with a positive absolute amount", async () => {
    const { stdout, code } = await runPosition(["--market", "SOL", "--owner", DEFAULT_AUTHORITY], {
      trader: shortState(),
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout).position).toMatchObject({
      side: "short",
      amount: "1500",
      decimals: 2,
      valueUsd: null,
    });
  });

  test("an active but flat trader is a typed flat position with exact collateral equity", async () => {
    const { stdout, code } = await runPosition(["--market", "SOL", "--owner", DEFAULT_AUTHORITY], {
      trader: flatState(),
    });
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.position).toMatchObject({ side: "flat", amount: "0" });
    expect(result.account.equityUsd).toBe("250");
  });

  test("a valid market with no registered trader is zero-position success, not an error", async () => {
    const { stdout, code } = await runPosition(["--market", "SOL", "--owner", OTHER_AUTHORITY], {
      trader: (authority) => coldState(authority),
    });
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.position).toMatchObject({
      account: OTHER_AUTHORITY,
      side: "flat",
      amount: "0",
    });
    expect(result.account).toMatchObject({ account: OTHER_AUTHORITY, equityUsd: "0" });
  });

  test("a multi-market account reads the requested market without mixing the other", async () => {
    const { stdout, code } = await runPosition(["--market", "ETH", "--owner", DEFAULT_AUTHORITY], {
      trader: multiMarketState(),
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout).position).toMatchObject({
      instrument: "ETH",
      side: "short",
      amount: "1000",
      decimals: 3,
    });
  });
});
