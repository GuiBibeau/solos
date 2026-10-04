// @ts-check
import { OpenPerpActionSchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { PerpInputInvalid } from "../domain/errors.js";

/** @typedef {{market:string;side:"long" | "short";notionalUsd:string;maxLeverage:number;limitPriceUsd:string}} OpenInput */

/** @param {OpenInput} input */
const openAction = (input) =>
  Effect.try({
    try: () =>
      OpenPerpActionSchema.parse({
        type: "open_perp",
        traderPdaIndex: 0,
        traderSubaccountIndex: 0,
        ...input,
      }),
    catch: () =>
      new PerpInputInvalid({
        reason:
          "Phoenix open requires a bounded market, side, positive u64 notional, leverage and finite limit price",
      }),
  });

/** @param {OpenInput} input */
export const simulatePerpOpen = (input) =>
  Effect.flatMap(openAction(input), (action) => simulateAction({ action })).pipe(
    Effect.withSpan("perp.simulateOpen"),
  );

/** @param {OpenInput & { skipSimulation?: boolean }} input */
export const executePerpOpen = (input) =>
  Effect.flatMap(openAction(input), (action) =>
    executeAction({ action, skipSimulation: input.skipSimulation, event: "perp.orderSubmitted" }),
  ).pipe(Effect.withSpan("perp.executeOpen"));
