// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executeOnboardTrader,
  executeOnboardTraderTool,
  executePerpDeposit,
  executePerpDepositTool,
  executePerpOpen,
  executePerpOpenTool,
  executePerpWithdrawal,
  executePerpWithdrawalTool,
  getOnboardingStatus,
  getOnboardingStatusTool,
  getPosition,
  getPositionTool,
  simulateOnboardTrader,
  simulateOnboardTraderTool,
  simulatePerpDeposit,
  simulatePerpDepositTool,
  simulatePerpOpen,
  simulatePerpOpenTool,
  simulatePerpWithdrawal,
  simulatePerpWithdrawalTool,
} from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { close, simulateClose } from "./perp-close-commands.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

const market = Options.text("market").pipe(optionHelp(getPositionTool.input.shape.market));
const owner = Options.text("owner").pipe(
  Options.optional,
  optionHelp(getPositionTool.input.shape.owner),
);

const position = Command.make("position", { market, owner }, (options) =>
  withSolos(
    getPosition({
      market: options.market,
      owner: Option.getOrUndefined(options.owner),
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(getPositionTool));

const onboardingStatus = Command.make("onboarding-status", {}, () =>
  withSolos(getOnboardingStatus().pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(getOnboardingStatusTool));

const simulateOnboard = Command.make("simulate-onboard", {}, () =>
  withSolos(simulateOnboardTrader().pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(simulateOnboardTraderTool));

const onboard = Command.make("onboard", {}, () =>
  withSolos(executeOnboardTrader().pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(executeOnboardTraderTool));

const depositAmount = Options.text("amount").pipe(
  optionHelp(simulatePerpDepositTool.input.shape.amount),
);
const withdrawalAmount = Options.text("amount").pipe(
  optionHelp(simulatePerpWithdrawalTool.input.shape.amount),
);

const simulateDeposit = Command.make("simulate-deposit", { amount: depositAmount }, ({ amount }) =>
  withSolos(simulatePerpDeposit({ amount }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(simulatePerpDepositTool));

const deposit = Command.make("deposit", { amount: depositAmount }, ({ amount }) =>
  withSolos(executePerpDeposit({ amount }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(executePerpDepositTool));

const simulateWithdraw = Command.make(
  "simulate-withdraw-collateral",
  { amount: withdrawalAmount },
  ({ amount }) =>
    withSolos(simulatePerpWithdrawal({ amount }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(simulatePerpWithdrawalTool));

const withdraw = Command.make("withdraw-collateral", { amount: withdrawalAmount }, ({ amount }) =>
  withSolos(executePerpWithdrawal({ amount }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(executePerpWithdrawalTool));

const openInput = {
  market: Options.text("market").pipe(optionHelp(simulatePerpOpenTool.input.shape.market)),
  side: Options.choice("side", ["long", "short"]).pipe(
    optionHelp(simulatePerpOpenTool.input.shape.side),
  ),
  notionalUsd: Options.text("notional-usd").pipe(
    optionHelp(simulatePerpOpenTool.input.shape.notionalUsd),
  ),
  maxLeverage: Options.float("max-leverage").pipe(
    optionHelp(simulatePerpOpenTool.input.shape.maxLeverage),
  ),
  limitPriceUsd: Options.text("limit-price-usd").pipe(
    optionHelp(simulatePerpOpenTool.input.shape.limitPriceUsd),
  ),
};

const simulateOpen = Command.make("simulate-open", openInput, (options) =>
  withSolos(simulatePerpOpen(options).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(simulatePerpOpenTool));

const open = Command.make(
  "open",
  { ...openInput, skipSimulation: Options.boolean("skip-simulation") },
  (options) => withSolos(executePerpOpen(options).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(executePerpOpenTool));

export const perp = Command.make("perp").pipe(
  groupHelp("Phoenix Perps: positions, enrollment, and explicit collateral management"),
  Command.withSubcommands([
    position,
    onboardingStatus,
    simulateOnboard,
    onboard,
    simulateDeposit,
    deposit,
    simulateWithdraw,
    withdraw,
    simulateOpen,
    open,
    simulateClose,
    close,
  ]),
);
