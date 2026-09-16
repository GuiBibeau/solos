# 0005 — Kit 8 + keychain; mainnet-only, the RPC URL is the only switch

Status: accepted, 2026-09-15

## Context

The most recent JavaScript stack is required: `@solana/kit` 8.x, `@solana-program/*`, web3.js only
when nothing else exists. Signing must be swappable between local keys and remote backends
without touching core. The project runs on mainnet; other environments are Surfpool.

## Decision

- `@solana/kit` 8.3.0 and `@solana-program/system` / `token`. Verified on Bun 1.3: native Ed25519,
  RPC, WebSocket subscriptions, no polyfills.
- `@solana/keychain` 1.4.0 (stable) via `@solana/keychain-memory` behind core's `Signer` port.
  Core sees only the address; the adapter-internal `KitSigner` tag holds the Kit-compatible
  signer. A remote backend (Turnkey, KMS, ...) is a different `KitSignerLive` factory, not a core
  change. Hardware wallets are out of scope until keychain ships a TypeScript backend.
- No network concept in code. `SOLANA_RPC_URL` is required and has no default; `SOLANA_WS_URL` is
  derived (same host for providers, port + 1 for localhost). Surfpool is just a localhost URL.
- Token balances are decoded with the token program's own codecs from base64 account data,
  because Surfpool 1.3 does not return `jsonParsed` for token accounts and decoding is more
  robust anyway. Decimals come from a batched mint fetch.

## Consequences

- Startup fails loudly without an RPC URL; nobody ships against the public endpoint by accident.
- Signer sources: `SOLOS_SIGNER_PRIVATE_KEY` (base58 or 64-byte JSON array, Solana CLI shape) or
  `SOLOS_SIGNER_KEYPAIR_PATH`. Exactly one.
