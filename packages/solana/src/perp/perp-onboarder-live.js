// @ts-check
import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import {
  PerpAccountCorrupt,
  PerpNetworkError,
  PerpOnboarder,
  PerpResponseInvalid,
  PerpStateIncomplete,
} from "@solos/core";
import { Effect, Layer } from "effect";
import { z } from "zod";
import { PHOENIX_PERPS_PROGRAM, TRADER_STATE_PATH } from "./phoenix-api.js";
import { statusError } from "./phoenix-errors.js";
import { phoenixOnboardGet } from "./phoenix-onboard-api.js";

const Capabilities = z.object({
  state: z.enum(["uninitialized", "cold", "active", "reduceOnly", "frozen"]),
  capabilities: z.object({
    placeMarketOrder: z.object({ immediate: z.boolean() }),
    riskIncreasingTrade: z.object({ immediate: z.boolean() }),
    depositCollateral: z.object({ immediate: z.boolean() }),
  }),
});
const TraderStatus = z.object({
  authority: z.string(),
  traderPdaIndex: z.literal(0),
  snapshot: z.object({
    capabilities: Capabilities,
    subaccounts: z.array(
      z.object({ subaccountIndex: z.number().int(), capabilities: Capabilities.optional() }),
    ),
  }),
});

/** @param {string} owner */
export const traderAddress = async (owner) => {
  const [trader] = await getProgramDerivedAddress({
    programAddress: address(PHOENIX_PERPS_PROGRAM),
    seeds: [
      "trader",
      getAddressEncoder().encode(address(owner)),
      new Uint8Array([0]),
      new Uint8Array([0]),
    ],
  });
  return trader;
};

/** @param {{ status: number; body: unknown }} outcome @param {string} owner */
const decodeStatus = (outcome, owner) =>
  Effect.gen(function* () {
    const httpError = statusError(outcome.status);
    if (httpError) return yield* Effect.fail(httpError);
    const parsed = TraderStatus.safeParse(outcome.body);
    if (!parsed.success)
      return yield* new PerpResponseInvalid({
        status: outcome.status,
        reason: "Phoenix trader status is invalid",
      });
    if (parsed.data.authority !== owner)
      return yield* new PerpAccountCorrupt({
        account: owner,
        reason: "trader authority mismatch",
      });
    const sub = parsed.data.snapshot.subaccounts.find((entry) => entry.subaccountIndex === 0);
    if (!sub)
      return yield* new PerpStateIncomplete({ reason: "Phoenix trader subaccount 0 is absent" });
    return { account: parsed.data.snapshot.capabilities, subaccount: sub.capabilities };
  });

/** @param {z.infer<typeof Capabilities>} access @param {string} scope */
const missingFor = (access, scope) =>
  [
    // Phoenix's cold trader is registered; immediate permissions may already be enabled.
    // Collateral is a separate prerequisite, not an enrollment permission.
    {
      ready: access.state === "active" || access.state === "cold",
      label: `${scope}.state.${access.state}`,
    },
    { ready: access.capabilities.placeMarketOrder.immediate, label: `${scope}.placeMarketOrder` },
    {
      ready: access.capabilities.riskIncreasingTrade.immediate,
      label: `${scope}.riskIncreasingTrade`,
    },
    { ready: access.capabilities.depositCollateral.immediate, label: `${scope}.depositCollateral` },
  ]
    .filter(({ ready }) => !ready)
    .map(({ label }) => label);

/** @param {import("./phoenix-api.js").PhoenixConfig} config @param {string} owner */
export const readOnboardingStatus = (config, owner) =>
  Effect.gen(function* () {
    const outcome = yield* Effect.tryPromise({
      try: () => phoenixOnboardGet(config, `${TRADER_STATE_PATH}/${encodeURIComponent(owner)}`),
      catch: () => new PerpNetworkError({ reason: "Phoenix trader status is unavailable" }),
    });
    if (outcome.status === 404)
      return { state: /** @type {const} */ ("unregistered"), trader: null };
    const { account, subaccount } = yield* decodeStatus(outcome, owner);
    const missing = [
      ...missingFor(account, "trader"),
      ...(subaccount ? missingFor(subaccount, "subaccount0") : []),
    ];
    const trader = yield* Effect.tryPromise({
      try: () => traderAddress(owner),
      catch: () => new PerpAccountCorrupt({ account: owner, reason: "invalid trader authority" }),
    });
    return missing.length === 0
      ? { state: /** @type {const} */ ("ready"), trader }
      : { state: /** @type {const} */ ("partial"), trader, missing };
  });

/** @param {import("./phoenix-api.js").PhoenixConfig} config */
export const PerpOnboarderLive = (config) =>
  Layer.succeed(PerpOnboarder, {
    status: (owner) => readOnboardingStatus(config, owner),
  });
