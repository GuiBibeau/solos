# solOS

[![npm](https://img.shields.io/npm/v/@solos-sh/cli?label=npm&color=cb3837)](https://www.npmjs.com/package/@solos-sh/cli)
[![release](https://img.shields.io/github/v/release/GuiBibeau/solos?display_name=release&label=release)](https://github.com/GuiBibeau/solos/releases/latest)
[![ci](https://github.com/GuiBibeau/solos/actions/workflows/ci.yml/badge.svg)](https://github.com/GuiBibeau/solos/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

<img src="docs/assets/soleebee-flying-kawaii.png" alt="Soleebee, the flying solOS robot bee mascot, holding a wrench" width="320" />

A Solana execution layer for LLM agents. One `solos` binary with an MCP server inside: swaps,
lending, perps, liquidity, transfers, strategies and market reads as 61 well-named tools your
agent discovers on demand. Works with Claude Code, Codex, Cursor and any other MCP client.
Mainnet by default. Your keys stay on your machine, and nothing that signs is offered until you
raise the ceiling yourself.

## Get started

**1. Install**

```sh
npm i -g @solos-sh/cli
```

Without Node: `curl -fsSL https://raw.githubusercontent.com/GuiBibeau/solos/main/install.sh | sh`.

Channels: `latest` is the stable lane. `npm i -g @solos-sh/cli@canary`, or `SOLOS_CHANNEL=canary`
on the install script, gives you the newest merge to `main`; `solos doctor` reports which lane
you run (`release.lane`).
Either way you get one `solos` command, with Bun embedded; nothing else to install.

**2. Connect a wallet**

```sh
solos login
```

Asks which wallet (a keypair file on this machine, Privy, or a `pay` account), asks for your RPC
URL, and saves a profile under `~/.config/solos`. There is no default RPC endpoint; the free tiers
at Helius, QuickNode and Triton all work.

**3. Connect your agent**

```sh
solos connect claude      # or: codex | cursor
```

Writes the solos entry into the client's config, keeps a backup of the file, and ends with the
`solos doctor` report. Restart the client and ask it: *what is my SOL balance?*

That is the whole setup. `solos doctor` tells you what is missing at any point, and prints the
MCP entry to paste into any other client.

## What your agent can do

| Group | Tools | Venues |
|---|---|---|
| `wallet`, `transfer`, `portfolio` | balances, addresses, SOL transfers, a supported-asset portfolio view | |
| `swap`, `launch` | quotes, simulated and executed swaps; bonding-curve buys and sells | Jupiter, Pump |
| `lend` | reserve rates, positions, deposits and withdrawals | Kamino |
| `liquidity` | positions, deposits, withdrawals; opens and closes on Raydium and an empty Meteora position | Orca, Raydium, Meteora |
| `perp` | positions, equity, collateral, bounded IOC opens and closes | Phoenix |
| `strategy` | register, update, list, status, ticks, and a kill switch | Engine |
| `market` | prices, token metadata, trending tokens, news and research summaries | Jupiter, Elfa |

The full catalogue with every argument is [Tools](docs/reference/tools/index.md). The server
advertises three tools at start, a search tool, the balance read and the portfolio read, and
enables the rest when the agent asks for them, so a 61-tool surface costs the agent nothing it
does not use.

## Safe by default

- **Read and simulate only, until you say otherwise.** Execute tools, the ones that send a
  transaction, are absent from the server until you connect with `--tier execute`. A simulate
  tool builds the real transaction and may ask your signer to sign it so the simulation is
  faithful, then sends only a simulation request with the signatures blanked (ADR-0033); nothing
  it does can land on chain. Every execute tool has a simulate twin, and execution simulates
  first unless the caller opts out with `--skip-simulation` (CLI) or `skipSimulation` (tools),
  which for swaps also drops the measured spend bound (ADR-0024).
- **Your keys never leave the machine.** Client configs carry a profile name, never a secret
  (ADR-0015). A local keypair, a Privy wallet or a `pay` account are the signer choices.
- **No policy inside the execution tools.** solOS does what the agent asks, within the ceiling
  you set (ADR-0006). Strategy bounds and the kill switch live on the Engine (ADR-0038). If you
  wire the execute tier into an unattended loop, that loop is the policy; choose it deliberately.

## The CLI

Every command prints JSON and exits non-zero on a domain error. Stderr is
`{ error: { code, reason, remedy } }`. `remedy` is left out when the error has none.

```sh
solos wallet balance
solos swap quote --input-mint So11111111111111111111111111111111111111112 \
  --output-mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --amount 10000000
solos swap simulate --input-mint So111... --output-mint EPjF... --amount 10000000   # builds, never sends
solos lend reserve --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
solos perp position --market SOL-PERP
solos portfolio state --owner <owner>
solos mcp list                       # what an MCP client sees
solos mcp call solana_swap_get_quote --args '{"inputMint":"So111...","outputMint":"EPjF...","amount":"10000000"}'
```

`solos --help` lists every group. Swap quotes and price reads need a `JUPITER_API_KEY`; market
research needs an `ELFA_API_KEY`. Strategy tools need `SOLOS_EXECUTOR=engine`, `SOLOS_ENGINE_URL`,
and `SOLOS_ENGINE_TOKEN`. The executor defaults to `direct`. Everything else needs the RPC URL and
the wallet.

## From source

```sh
git clone https://github.com/GuiBibeau/solos && cd solos
bun install
bun run solos login
bun run solos mcp list
```

Requires Bun 1.3 or later. The checkout's own `.mcp.json` points Claude Code at the source
server. [AGENTS.md](AGENTS.md) is the working guide for this checkout; `bun run solos dev build`
compiles the binary.

## Docs

- [Getting started](docs/getting-started.md), the long version of the three steps above
- [Tools](docs/reference/tools/index.md) and [Errors](docs/reference/errors.md)
- Clients: [Claude Code](docs/clients/claude-code.md), [Codex](docs/clients/codex.md), [Cursor](docs/clients/cursor.md)
- [Decisions](docs/adr/README.md), [CONTEXT.md](CONTEXT.md), [Feature map](features/README.md)
- [Engine host](docs/engine-ops.md): the service user, systemd unit, and environment file for the compiled binary

## Contributing

solOS is a personal project. Outside pull requests and contributions are not accepted. A workflow
closes pull requests opened from outside this repository. [CONTRIBUTING.md](CONTRIBUTING.md) has
the maintainer workflow.

Bug reports go through the [bug template](https://github.com/GuiBibeau/solos/issues/new?template=bug.yml).
There is no template for questions, and blank issues are disabled. Security problems go through
[SECURITY.md](SECURITY.md), never a public issue.

The licence is Apache-2.0. Starring the repository is fine, and so is forking it and shipping
your own build.

## License

Apache-2.0. Copyright 2026 Guillaume Bibeau Laviolette.
