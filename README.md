# solOS

A thin Solana execution layer for LLM agents. An MCP server, a harness, and the `solos` CLI
share one core. Many tools, no policy. Execute paths are proven with a real mainnet spend.

Bun, Effect, Zod, and Solana Kit. Mainnet by default.

## Quick start

```sh
bun install
bun run solos login --provider privy --rpc-url https://your-provider-url   # or local | pay
bun run solos mcp list
bun run solos wallet balance
```

Requires Bun ≥ 1.3.

## Examples

Commands print JSON. Reads do not sign. `swap simulate` builds the swap for the configured
signer and does not send it. `swap execute` takes the same flags and, by default, simulates
before it submits. `--skip-simulation` skips that pre-submit simulation. Swap calls need
`JUPITER_API_KEY`.

```sh
# Indicative quote: 0.01 wSOL to USDC. Nothing is signed.
bun run solos swap quote \
  --input-mint So11111111111111111111111111111111111111112 \
  --output-mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 10000000

# Same swap, simulated for the configured signer. Nothing is submitted.
bun run solos swap simulate \
  --input-mint So11111111111111111111111111111111111111112 \
  --output-mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 10000000

# USDC supply APY, borrow APY, and available liquidity on Kamino's default market.
bun run solos lend reserve --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Phoenix SOL-PERP position for the configured trader.
bun run solos perp position --market SOL-PERP

# One Meteora DLMM position. Read-only; deposits still reject meteora.
bun run solos liquidity position --protocol meteora --position <position-account>
```

The same quote over MCP:

```sh
bun run solos mcp call solana_swap_get_quote --args '{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"10000000"}'
```

The full catalog is [Tools](docs/reference/tools/index.md). A deeper Learn path comes later.

## Layout

`packages/` is actions, core, Solana adapters, and the MCP server. `apps/` is the harness and the
`solos` CLI.

## Docs

- [Tools](docs/reference/tools/index.md)
- [Decisions](docs/adr/README.md)
- [Clients](docs/clients/) — Claude Code, Codex, and Cursor
- [AGENTS.md](AGENTS.md)
- [CONTEXT.md](CONTEXT.md)
- [Feature map](features/README.md)

## License

Apache-2.0. Copyright 2026 Guillaume Bibeau Laviolette.
