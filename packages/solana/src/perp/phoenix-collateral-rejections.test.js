// @ts-check
import { beforeAll, expect, test } from "bun:test";
import { decodeTrader } from "@ellipsis-labs/rise";
import { getBase16Decoder } from "@solana/kit";
import { ActionExecutor, BuildRejected } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaRpc, SolanaRpcLive, SolanaTestLive } from "../index.js";
import { ensureOfflineSurfnet, jsonRpc, randomSeed } from "../surfnet/index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { TRADER_STATE_PATH } from "./phoenix-api.js";
import { startCollateralScenario } from "./phoenix-collateral-test-scenario.js";
import { assertWithdrawalReady } from "./phoenix-collateral-withdraw.js";

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
});

/** @param {ReturnType<typeof SolanaTestLive>} layer @param {"deposit_perp_collateral" | "withdraw_perp_collateral"} type @param {string} amount */
const reject = async (layer, type, amount) => {
  const action = { type, amount, traderPdaIndex: 0, traderSubaccountIndex: 0 };
  const run = Effect.flatMap(ActionExecutor, (executor) =>
    executor.execute(action, { skipSimulation: true }),
  );
  const exit = await Effect.runPromiseExit(run.pipe(Effect.provide(layer)));
  expect(exit._tag).toBe("Failure");
  if (exit._tag !== "Failure") return;
  const error = Cause.failureOption(exit.cause);
  expect(Option.isSome(error) && error.value).toBeInstanceOf(BuildRejected);
  return Option.isSome(error) ? /** @type {BuildRejected} */ (error.value) : undefined;
};

/** @param {ReturnType<typeof startRpcRecorder>} recorder */
const noSend = (recorder) => {
  expect(recorder.callsFor("simulateTransaction")).toHaveLength(0);
  expect(recorder.callsFor("sendTransaction")).toHaveLength(0);
};

/** @param {string} url @param {string} key */
const corruptAtaOwner = async (url, key) => {
  const { value } = await jsonRpc(url, "getAccountInfo", [key, { encoding: "base64" }]);
  if (!value) throw new Error("expected funded USDC ATA");
  await jsonRpc(url, "surfnet_setAccount", [
    key,
    {
      lamports: value.lamports,
      owner: "11111111111111111111111111111111",
      executable: false,
      data: getBase16Decoder().decode(Buffer.from(value.data[0], "base64")),
    },
  ]);
};

test("Phoenix risk [integration] reads its comparison slot after the all-market snapshot", async () => {
  const scenario = await startCollateralScenario(surfnet.rpcUrl, randomSeed(), {
    collateral: 2_000_000n,
  });
  const slot = await jsonRpc(surfnet.rpcUrl, "getSlot", [{ commitment: "confirmed" }]);
  /** @type {boolean[]} */
  const snapshotSeen = [];
  const recorder = startRpcRecorder(surfnet.rpcUrl, {
    getSlot: () => {
      snapshotSeen.push(
        scenario.fixture.requests.some(({ path }) => path.startsWith(`${TRADER_STATE_PATH}/`)),
      );
      return slot + 1;
    },
  });
  try {
    const { value } = await jsonRpc(surfnet.rpcUrl, "getAccountInfo", [
      scenario.trader,
      { encoding: "base64" },
    ]);
    if (!value) throw new Error("expected seeded Phoenix trader");
    const trader = decodeTrader(Uint8Array.from(Buffer.from(value.data[0], "base64")));
    const check = Effect.flatMap(SolanaRpc, (ctx) =>
      assertWithdrawalReady({
        config: { baseUrl: scenario.fixture.url },
        ctx,
        owner: scenario.owner,
        trader,
      }),
    );
    expect(
      await Effect.runPromise(
        check.pipe(Effect.provide(SolanaRpcLive(recorder.url, surfnet.wsUrl))),
      ),
    ).toBe(2_000_000n);
    expect(snapshotSeen).toEqual([true]);
  } finally {
    recorder.stop();
    scenario.fixture.stop();
  }
});

for (const failure of /** @type {const} */ ([
  "insufficient",
  "invalid_custody",
  "stale_risk",
  "deposit_disabled",
  "withdraw_disabled",
])) {
  test(`Phoenix collateral [integration] ${failure} fails closed before simulation or send`, async () => {
    const seed = randomSeed();
    const scenario = await startCollateralScenario(surfnet.rpcUrl, seed, {
      collateral: 2_000_000n,
      staleRisk: failure === "stale_risk",
      depositDisabled: failure === "deposit_disabled",
      withdrawDisabled: failure === "withdraw_disabled",
    });
    const recorder = startRpcRecorder(surfnet.rpcUrl);
    try {
      if (failure === "invalid_custody") await corruptAtaOwner(surfnet.rpcUrl, scenario.atas.usdc);
      const layer = SolanaTestLive({
        rpcUrl: recorder.url,
        wsUrl: surfnet.wsUrl,
        seed,
        phoenix: { baseUrl: scenario.fixture.url },
      });
      if (failure !== "stale_risk" && failure !== "withdraw_disabled")
        await reject(
          layer,
          "deposit_perp_collateral",
          failure === "insufficient" ? "3000000" : "1000000",
        );
      if (failure !== "deposit_disabled") {
        const error = await reject(
          layer,
          "withdraw_perp_collateral",
          failure === "insufficient" ? "3000000" : "1000000",
        );
        if (failure === "stale_risk")
          expect(error?.reason).toBe("Phoenix withdrawal risk snapshot is stale");
      }
      noSend(recorder);
    } finally {
      scenario.fixture.stop();
      recorder.stop();
    }
  });
}
