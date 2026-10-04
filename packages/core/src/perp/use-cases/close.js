// @ts-check
import { ClosePerpActionSchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { PerpInputInvalid } from "../domain/errors.js";

/** @typedef {{market:string;limitPriceUsd:string}} CloseInput */
/** @param {CloseInput} input */
const closeAction = (input) =>
  Effect.try({
    try: () =>
      ClosePerpActionSchema.parse({
        type: "close_perp",
        traderPdaIndex: 0,
        traderSubaccountIndex: 0,
        ...input,
      }),
    catch: () =>
      new PerpInputInvalid({ reason: "Phoenix close requires a market and finite limit price" }),
  });

/** @param {CloseInput} input */
export const simulatePerpClose = (input) =>
  Effect.flatMap(closeAction(input), (action) => simulateAction({ action })).pipe(
    Effect.withSpan("perp.simulateClose"),
  );

/** @param {CloseInput & {skipSimulation?:boolean}} input */
export const executePerpClose = (input) =>
  Effect.flatMap(closeAction(input), (action) =>
    executeAction({ action, skipSimulation: input.skipSimulation, event: "perp.closeSubmitted" }),
  ).pipe(Effect.withSpan("perp.executeClose"));
