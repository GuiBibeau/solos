# solOS

[![npm](https://img.shields.io/npm/v/@solos-sh/cli?label=npm&color=cb3837)](https://www.npmjs.com/package/@solos-sh/cli)
[![release](https://img.shields.io/github/v/release/GuiBibeau/solos?display_name=release&label=release)](https://github.com/GuiBibeau/solos/releases/latest)
[![ci](https://github.com/GuiBibeau/solos/actions/workflows/ci.yml/badge.svg)](https://github.com/GuiBibeau/solos/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

<img src="docs/assets/soleebee-flying-kawaii.png" alt="Soleebee, the flying solOS robot bee mascot, holding a wrench" width="320" />

A Solana execution layer for LLM agents. One `solos` binary with an MCP server inside: swaps,
lending, perps, liquidity, transfers and market reads as 49 well-named tools your agent discovers
on demand. Works with Claude Code, Codex, Cursor and any other MCP client. Mainnet by default.
Your keys stay on your machine, and nothing that signs is offered until you raise the ceiling
yourself.

## Get started

**1. Install**

```sh
npm i -g @solos-sh/cli
```

Without Node: `curl -fsSL https://raw.githubusercontent.com/GuiBibeau/solos/main/install.sh | sh`.
Either way you get one `solos` command, with Bun embedded; nothing else to install.

**2. Connect a wallet**

```sh
solos login
```

Picks a Solana CLI keypair already on this machine, or logs you in with Privy, asks for your RPC
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
| `liquidity` | positions, deposits, withdrawals, opening and closing concentrated ranges | Orca, Raydium, Meteora |
| `perp` | positions, equity, collateral, bounded IOC opens and closes | Phoenix |
| `market` | prices, token metadata, trending tokens, news and research summaries | Jupiter, Elfa |

The full catalogue with every argument is [Tools](docs/reference/tools/index.md). The server
advertises three tools at start, a search tool, the balance read and the portfolio read, and
enables the rest when the agent asks for them, so a 49-tool surface costs the agent nothing it
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
- **No policy inside.** solOS is a thin execution layer: it does exactly what the agent asks,
  within the ceiling you set, and nothing more (ADR-0006). Bounds, approvals and strategy belong
  to the agent harness you run it in. If you wire the execute tier into an unattended loop, that
  loop is the policy; choose it deliberately.

## The CLI

Every command prints JSON and exits non-zero on a domain error with `{ code, reason, remedy }`.

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
research needs an `ELFA_API_KEY`; everything else needs only the RPC URL and the wallet.

## From source

```sh
git clone https://github.com/GuiBibeau/solos && cd solos
bun install
bun run solos login
bun run solos mcp list
```

Requires Bun 1.3 or later. The checkout's own `.mcp.json` points Claude Code at the source
server. [AGENTS.md](AGENTS.md) is the contributor guide; `bun run solos dev build` compiles the
binary.

## Docs

- [Getting started](docs/getting-started.md), the long version of the three steps above
- [Tools](docs/reference/tools/index.md) and [Errors](docs/reference/errors.md)
- Clients: [Claude Code](docs/clients/claude-code.md), [Codex](docs/clients/codex.md), [Cursor](docs/clients/cursor.md)
- [Decisions](docs/adr/README.md), [CONTEXT.md](CONTEXT.md), [Feature map](features/README.md)

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) is the short version;
[AGENTS.md](AGENTS.md) has the conventions the lint rules enforce. Issues labelled
[good first issue](https://github.com/GuiBibeau/solos/labels/good%20first%20issue) are scoped
for a first change. Report security problems through [SECURITY.md](SECURITY.md), never in a
public issue.

If solOS saves you time, a star on GitHub helps other agent builders find it.

## License

Apache-2.0. Copyright 2026 Guillaume Bibeau Laviolette.
