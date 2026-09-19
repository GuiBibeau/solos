// @ts-check
import { Command, Options } from "@effect/cli";
import { getLpPosition } from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const protocol = Options.text("protocol").pipe(
  Options.withDescription(
    "Liquidity protocol. Only orca (Whirlpools) is implemented; meteora and raydium fail before any network access.",
  ),
);

const position = Options.text("position").pipe(
  Options.withDescription(
    "Protocol position-account address (the Whirlpool position PDA), never the NFT mint and never the pool.",
  ),
);

const owner = Options.text("owner").pipe(
  Options.optional,
  Options.withDescription(
    "Owner whose position NFT custody proves ownership. Defaults to the configured signer.",
  ),
);

const positionCommand = Command.make("position", { protocol, position, owner }, (options) =>
  withSolos(
    getLpPosition({
      // The use case re-validates: a value outside the venue enum fails LiquidityInputInvalid.
      protocol: /** @type {"orca" | "meteora" | "raydium"} */ (options.protocol),
      position: options.position,
      owner: Option.getOrUndefined(options.owner),
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read one Orca Whirlpool LP position: raw liquidity and underlying A/B amounts (read-only)",
  ),
);

export const liquidity = Command.make("liquidity").pipe(
  Command.withDescription("Liquidity venues: Orca Whirlpool positions (read-only today)"),
  Command.withSubcommands([positionCommand]),
);
