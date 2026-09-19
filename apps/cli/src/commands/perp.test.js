// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { runSolos, stderrJson } from "./cli-fixture.js";
import { OWNER, signerEnv, startPerpFixture } from "./perp-fixture.js";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {{ requests: Array<{ path: string; query: Record<string, string> }>; url: string; stop: () => void }} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fixture = startPerpFixture();
});

afterAll(() => {
  fixture?.stop();
});

describe("`solos perp position` through a real CLI child process [integration]", () => {
  test("prints the contract JSON and resolves the omitted owner to the configured signer", async () => {
    const { address, env } = await signerEnv(surfnet, fixture.url);
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await runSolos(
      ["perp", "position", "--market", "SOL-PERP"],
      env,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.position).toMatchObject({
      kind: "perp",
      protocol: "phoenix",
      account: address,
      instrument: "SOL",
      side: "long",
      amount: "1500",
      decimals: 2,
      valueUsd: null,
    });
    expect(result.account).toMatchObject({
      protocol: "phoenix",
      account: address,
      equityUsd: null,
    });
    const seen = fixture.requests.slice(before);
    const market = seen.find((entry) => entry.path.startsWith("/v1/view/exchange/market/"));
    const trader = seen.find((entry) => entry.path.startsWith("/v1/trader/state/"));
    expect(market?.path).toBe("/v1/view/exchange/market/SOL");
    expect(trader?.query).toEqual({ traderPdaIndex: "0" });
    expect(trader?.path).toBe(`/v1/trader/state/${address}`);
  });

  test("an unknown market exits non-zero with the tagged error before account work", async () => {
    const { env } = await signerEnv(surfnet, fixture.url);
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await runSolos(["perp", "position", "--market", "DOGE"], env);
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "PerpMarketUnknown", market: "DOGE" });
    expect(fixture.requests.slice(before)).toHaveLength(1);
  });

  test("an explicit owner is honored verbatim instead of the signer", async () => {
    const { env } = await signerEnv(surfnet, fixture.url);
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      ["perp", "position", "--market", "SOL", "--owner", OWNER],
      env,
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout).position.account).toBe(OWNER);
    const trader = fixture.requests
      .slice(before)
      .find((entry) => entry.path.startsWith("/v1/trader/state/"));
    expect(trader?.path).toBe(`/v1/trader/state/${OWNER}`);
  });
});
