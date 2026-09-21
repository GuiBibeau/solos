#!/usr/bin/env bun
// @ts-check
/**
 * `solos`: operator CLI and the agent verification lever (ADR-0010).
 * Every command prints JSON. Exit code is non-zero on any domain error.
 */
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import { agent } from "./commands/agent.js";
import { daemon } from "./commands/daemon.js";
import { dev } from "./commands/dev.js";
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

const root = Command.make("solos").pipe(
  Command.withDescription(
    "solOS: Solana execution layer for LLM agents. Reusable tests run on Surfpool; live commands hit whatever SOLANA_RPC_URL points at.",
  ),
  Command.withSubcommands([
    login,
    profiles,
    wallet,
    transfer,
    market,
    swap,
    launch,
    lend,
    liquidity,
    perp,
    portfolio,
    mcp,
    router,
    agent,
    daemon,
    dev,
  ]),
);

const cli = Command.run(root, { name: "solos", version: "0.0.0" });

const program = /** @type {Effect.Effect<void, unknown, never>} */ (
  cli(process.argv).pipe(Effect.scoped, Effect.provide(BunContext.layer))
);

BunRuntime.runMain(program, { disableErrorReporting: false });
