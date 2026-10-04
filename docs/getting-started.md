# Getting started

Three commands put solOS in front of your agent. This page is the long version: what each one
does, what it writes, and what to do when something is missing.

## 1. Install

Pick one.

```sh
npm i -g @solos-sh/cli                 # Node 20 or later; also: bun add -g @solos-sh/cli
```

```sh
curl -fsSL https://raw.githubusercontent.com/GuiBibeau/solos/main/install.sh | sh
```

Both give you one `solos` executable with the Bun runtime embedded; there is nothing else to
install. The npm package is a small launcher that installs the binary for your platform as an
optional dependency. The script downloads the same binary from the GitHub release, verifies its
SHA-256 against the release's `SHA256SUMS`, and puts it in `~/.solos/bin` (set `SOLOS_INSTALL` to
change the prefix, `SOLOS_VERSION` to pin a release).

Supported today: macOS (Apple silicon and Intel) and Linux (x64 and arm64).

```sh
solos --version
```

## 2. Connect a wallet

```sh
solos login
```

`login` asks two things and saves them as a **profile** in `~/.config/solos/credentials.json`
(mode 0600):

- **Which wallet.** A Solana CLI keypair file already on this machine (the ones under
  `~/.config/solana` are listed), a Privy wallet through a browser login, or an account of the
  `pay` CLI. Scripts pass `--provider local|privy|pay|privy-server` and the provider's own flags.
- **Which RPC URL.** There is no default endpoint on purpose; the free tiers at Helius, QuickNode
  and Triton all work. The URL must be https (plain http only on a loopback host). Leave the
  answer blank if you would rather export `SOLANA_RPC_URL` yourself; `SOLANA_RPC_URL` in the
  environment always wins over the profile.

`login` verifies the wallet once and prints its address. The first profile is the default. A
later one is not, unless you say so: `solos login --profile trading --default`, or switch
afterwards with `solos profiles default trading`, or pin it for one client with
`solos connect claude --profile trading`. `solos profiles list | default | remove` manage them.

## 3. Connect your agent

```sh
solos connect claude      # Claude Code
solos connect codex       # Codex CLI
solos connect cursor      # Cursor
```

`connect` writes the solos MCP entry into the client's config at user scope, keeps a timestamped
backup next to the file, leaves every other key and server alone, and finishes with the
`solos doctor` report for the environment the server will start in.

| Client | File | Project scope (`--scope project`) |
|---|---|---|
| Claude Code | `~/.claude.json` | `./.mcp.json` |
| Codex | `~/.codex/config.toml` | not supported by Codex |
| Cursor | `~/.cursor/mcp.json` | `./.cursor/mcp.json` |

The entry is `solos mcp serve`, the MCP server inside the binary. Add `--profile <name>` to pin a
profile, `--print` to see the entry without writing anything, and `--tier execute` to raise the
ceiling (below). For any other client, `solos doctor` prints the same entry to paste.

Restart the client. In Claude Code, `claude mcp get solos` confirms the connection. Then ask:
*what is my SOL balance?*

## 4. Your first calls

The server starts with three tools visible: a search tool, the wallet balance and the portfolio
view. When the agent needs more, it searches and the matching tools appear. You can watch the
same thing from the CLI:

```sh
solos mcp list
solos mcp call solana_wallet_get_balance --args '{}'
solos mcp call solana_swap_get_quote --args '{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"10000000"}'
```

Two provider keys unlock more: `JUPITER_API_KEY` for prices and swap quotes, `ELFA_API_KEY` for
market research. Without them, the tools still list and fail with a `reason` and a `remedy` when
called. Put the keys in the client's `env` for the solos entry, or in the environment the client
starts from.

## 5. The ceiling

By default the server offers **read and simulate** tools only. A simulate tool builds the real
transaction for your wallet, may ask your signer to sign it so the simulation is faithful, and
sends only a simulation request with the signatures blanked (ADR-0033): nothing it does can land
on chain. The execute tools, the ones that send, do not exist on the server until you raise the
ceiling:

```sh
solos connect claude --tier execute
```

That is the one deliberate act. Every execute tool has a simulate twin. Execution simulates
first unless the caller passes `--skip-simulation` (CLI) or `skipSimulation` (tools), which for
swaps also drops the measured spend bound (ADR-0024). And the server still has no spending policy
of its own (ADR-0006): the agent decides, within what your keypair holds. If you run the execute
tier in an unattended loop, size the wallet for it.

`--tier read` is the other direction: a read-only deployment that cannot even build.

## When something is missing

```sh
solos doctor
```

Reports every problem at once with a `reason` and a `remedy`: no signer, no RPC URL, a profile
without an RPC URL, two signers set at the same time. It never prints a secret. The MCP server
fails to start for the same reasons, and the client shows only `Connection closed`; the real
cause is one JSON line on the server's stderr, which `solos doctor` reproduces.

Logs are JSON on stderr; `SOLOS_LOG_LEVEL=debug` in the entry's `env` turns them up.

## Uninstall

`npm rm -g @solos-sh/cli`, or delete `~/.solos`. Profiles live in `~/.config/solos`; the MCP
entry is the `solos` key in the client file `connect` named, next to its `.bak-` copy.
