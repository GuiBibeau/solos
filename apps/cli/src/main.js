#!/usr/bin/env bun
// @ts-check
/**
 * `solos`: the operator CLI (ADR-0010). Every command prints JSON; the exit code is non-zero on
 * any domain error. The developer lever (`solos dev ...`) joins the command tree only under
 * `SOLOS_DEV=1`, which the checkout's `bun run solos` script sets; an installed `solos` never
 * advertises it (ADR-0034).
 */
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { SOLOS_VERSION } from "@solos/mcp";
import { Effect } from "effect";
import { agent } from "./commands/agent.js";
import { connect } from "./commands/connect.js";
import { dev } from "./commands/dev.js";
import { discovery } from "./commands/discovery.js";
import { doctor } from "./commands/doctor.js";
import { launch } from "./commands/launch.js";
import { lend } from "./commands/lend.js";
import { liquidity } from "./commands/liquidity.js";
import { login } from "./commands/login.js";
import { market } from "./commands/market.js";
import { mcp } from "./commands/mcp.js";
import { perp } from "./commands/perp.js";
import { portfolio } from "./commands/portfolio.js";
import { profiles } from "./commands/profiles.js";
import { router } from "./commands/router.js";
import { swap } from "./commands/swap.js";
import { transfer } from "./commands/transfer.js";
import { wallet } from "./commands/wallet.js";

/**
 * The lever is a checkout tool, not a product surface. Exactly "1" enables it: a blank value, as
 * a copied `.env.example` leaves one, means unset.
 * @param {NodeJS.ProcessEnv} env
 */
const hasDevLever = (env) => env.SOLOS_DEV === "1";

const operatorCommands = /** @type {const} */ ([
  login,
  profiles,
  doctor,
  connect,
  wallet,
  transfer,
  market,
  swap,
  launch,
  lend,
  liquidity,
  perp,
  portfolio,
  discovery,
  mcp,
  router,
  agent,
]);

const root = Command.make("solos").pipe(
  Command.withDescription(
    "solOS: Solana execution layer for LLM agents. Every command prints JSON; live commands hit whatever SOLANA_RPC_URL points at.",
  ),
  Command.withSubcommands(hasDevLever(process.env) ? [...operatorCommands, dev] : operatorCommands),
);

const cli = Command.run(root, { name: "solos", version: SOLOS_VERSION });

const program = /** @type {Effect.Effect<void, unknown, never>} */ (
  cli(process.argv).pipe(Effect.scoped, Effect.provide(BunContext.layer))
);

BunRuntime.runMain(program, { disableErrorReporting: false });
