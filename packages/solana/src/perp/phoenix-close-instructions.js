// @ts-check
import { OrderFlags } from "@ellipsis-labs/rise";
import { buildPhoenixIocInstruction } from "./phoenix-open-instructions.js";

/** @param {Parameters<typeof buildPhoenixIocInstruction>[0]} input */
export const buildCloseInstruction = (input) =>
  buildPhoenixIocInstruction(input, OrderFlags.ReduceOnly);
