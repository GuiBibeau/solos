// @ts-check
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { Signer } from "../../wallet/index.js";
import { PerpOnboarder } from "../ports/perp-onboarder.js";

const action = /** @type {const} */ ({
  type: "onboard_perp",
  traderPdaIndex: 0,
  traderSubaccountIndex: 0,
});

/** Check the configured wallet's default trader; never return another owner's state. */
export const getOnboardingStatus = () =>
  Effect.gen(function* () {
    const owner = yield* (yield* Signer).address();
    return yield* (yield* PerpOnboarder).status(owner);
  }).pipe(Effect.withSpan("perp.onboardingStatus"));

/** Simulate Phoenix enrollment only when the wallet is not yet trading-enabled. */
export const simulateOnboardTrader = () =>
  Effect.gen(function* () {
    const status = yield* getOnboardingStatus();
    if (status.state === "ready") return { status: "already_ready", trader: status.trader };
    return yield* simulateAction({ action });
  }).pipe(Effect.withSpan("perp.simulateOnboardTrader"));

/** Enrollment is an explicit operation, never a hidden step in a position open. */
export const executeOnboardTrader = () =>
  Effect.gen(function* () {
    const status = yield* getOnboardingStatus();
    if (status.state === "ready") return { status: "already_ready", trader: status.trader };
    return yield* executeAction({ action, event: "perp.onboarded" });
  }).pipe(Effect.withSpan("perp.executeOnboardTrader"));
