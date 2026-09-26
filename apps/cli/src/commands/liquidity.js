// @ts-check
import { Command, Options } from "@effect/cli";
import { executeDeposit, getLpPosition, simulateDeposit } from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import {
  closeCommand,
  openCommand,
  simulateCloseCommand,
  simulateOpenCommand,
} from "./liquidity-lifecycle.js";
import { simulateWithdrawCommand, withdrawCommand } from "./liquidity-withdraw.js";

const protocol = Options.text("protocol").pipe(
  Options.withDescription(
    "Liquidity protocol. orca (Whirlpools), raydium (CLMM), and meteora (DLMM) deposits are implemented. Opens and closes still reject meteora.",
  ),
);

const readProtocol = Options.text("protocol").pipe(
  Options.withDescription(
    "Liquidity protocol. orca (Whirlpools), raydium (CLMM), and meteora (DLMM) are implemented for this read.",
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
    "Owner to prove against. Orca and Raydium require custody of the position NFT; Meteora matches the position account's owner field. Defaults to the configured signer.",
  ),
);

const positionCommand = Command.make(
  "position",
  { protocol: readProtocol, position, owner },
  (options) =>
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
    "Read one concentrated-liquidity LP position on orca, raydium, or meteora: raw liquidity and underlying A/B amounts. owner defaults to the configured signer, so a third party's position can be read by naming its owner (read-only)",
  ),
);

const wrapSol = Options.boolean("wrap-sol").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Wrap exactly the native SOL the quote is short on a wSOL side, in this same transaction, and unwrap the remainder when this transaction created the account. Defaults to false.",
  ),
);

const depositOptions = {
  protocol,
  pool: Options.text("pool").pipe(
    Options.withDescription(
      "Pool address the position belongs to; the deposit fails when the position references a different pool.",
    ),
  ),
  position: Options.text("position").pipe(
    Options.withDescription(
      "Existing position account: Whirlpool PDA, Raydium personal position, or Meteora PositionV2. Never an NFT mint. New positions and bin-range changes are refused.",
    ),
  ),
  amountA: Options.text("amount-a").pipe(
    Options.withDescription(
      "Maximum token A spend in base units of the pool's canonical token A mint, as an integer string; unused funds stay in the wallet.",
    ),
  ),
  amountB: Options.text("amount-b").pipe(
    Options.withDescription(
      "Maximum token B spend in base units of the pool's canonical token B mint, as an integer string; unused funds stay in the wallet.",
    ),
  ),
  maxSlippageBps: Options.integer("max-slippage-bps").pipe(
    Options.withDefault(50),
    Options.withDescription(
      "Price-movement tolerance in basis points, 0..9999. Orca and Raydium use on-chain spend bounds. Meteora caps the signed amounts and refuses before send if the active bin moved more than ceil(slippage / bin step) bins. Default 50.",
    ),
  ),
  wrapSol,
};

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Skip the pre-send simulation of the exact transaction. Defaults to false.",
  ),
);

const simulateDepositCommand = Command.make("simulate-deposit", depositOptions, (options) =>
  withSolos(
    simulateDeposit({
      protocol: /** @type {"orca" | "meteora" | "raydium"} */ (options.protocol),
      pool: options.pool,
      position: options.position,
      amountA: options.amountA,
      amountB: options.amountB,
      maxSlippageBps: options.maxSlippageBps,
      wrapSol: options.wrapSol,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Simulate adding liquidity to one existing Orca, Raydium, or Meteora position without submitting anything. Orca and Raydium encode on-chain spend bounds. Meteora caps the signed amounts and checks active-bin drift before send",
  ),
);

const depositCommand = Command.make("deposit", { ...depositOptions, skipSimulation }, (options) =>
  withSolos(
    executeDeposit({
      protocol: /** @type {"orca" | "meteora" | "raydium"} */ (options.protocol),
      pool: options.pool,
      position: options.position,
      amountA: options.amountA,
      amountB: options.amountB,
      maxSlippageBps: options.maxSlippageBps,
      wrapSol: options.wrapSol,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Add liquidity to one existing Orca, Raydium, or Meteora position and wait for confirmation; simulates the exact transaction first, and sends nothing when simulation or validation fails (moves funds)",
  ),
);

export const liquidity = Command.make("liquidity").pipe(
  Command.withDescription(
    "Liquidity venues: Orca, Raydium, and Meteora position reads, deposits, and withdrawals on existing positions, and opening or closing a Raydium position at a range you choose",
  ),
  Command.withSubcommands([
    positionCommand,
    simulateDepositCommand,
    depositCommand,
    simulateWithdrawCommand,
    withdrawCommand,
    simulateOpenCommand,
    openCommand,
    simulateCloseCommand,
    closeCommand,
  ]),
);
