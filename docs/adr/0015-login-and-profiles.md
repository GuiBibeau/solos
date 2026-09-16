# 0015 — `solos login --provider` and wallet profiles

Status: accepted, 2026-09-16

## Context

Until now the only way to give solOS a wallet was two env vars copied into every MCP client config
and shell. The team wants a pi-style experience: pick a provider, bring your own keys, and have the
MCP server and the harness find the wallet afterwards. Research is in
`docs/research/wallet-login.md`.

## Decision

- **Credential store.** `~/.config/solos/credentials.json` (override with `SOLOS_CONFIG_DIR`),
  written atomically with `0600`, directory `0700`. Named profiles, one default. Profile schemas
  live in `packages/solana/src/credentials/profile.js`, discriminated on `provider`.
- **Providers today.** `local` (a Solana CLI keypair file), `pay` (an account of the `pay` CLI,
  exported to memory on demand, never copied), `privy` (the user's own Privy embedded wallet
  through a browser login, see below), `privy-server` (an app-owned server wallet through
  `@solana/keychain-privy`, for headless deployments that hold an app secret). Para was dropped: it
  has no consumer login that ends in a server-side signing credential. Adding a provider is one profile schema, one `SignerSource`
  variant, one case in `KitSignerLive`.
- **Privy user login.** `solos login --provider privy` runs Privy's OAuth device-code flow against
  its Agent Wallets app (the same default app id the official `@privy-io/agent-wallet-cli` uses;
  `PRIVY_APP_ID` selects a solOS-registered app instead). The user approves in a browser; the CLI
  receives a refresh token (30 days, rotated on use) and an HPKE-encrypted ephemeral authorization
  key, picks the account's Solana wallet, and stores the session as the profile. No app secret
  exists on this side. Signing goes through `auth.privy.io/api/oauth/v2/wallets/{id}/rpc` with a
  P-256 signature over the canonical request (`packages/solana/src/privy/`). Sessions refresh
  themselves and write back to the profile. Running `login` again with a valid session reports
  the address instead of prompting; `--force` re-logs in.
- **Discovery.** `solos login --provider local` lists keypairs under `~/.config/solana`;
  `--provider pay` lists accounts from `~/.config/pay/accounts.yml` (public data only). The user
  picks one or enters another. Flags make every provider non-interactive.
- **Secrets as references.** A stored secret may be a literal, `$ENV_VAR`, or `!command`
  (pi's convention), so vendor secrets can stay in the environment or a password manager.
- **Resolution order in every composition root** (`loadSolanaEnv`): explicit
  `SOLOS_SIGNER_*` env, then the profile named by `SOLOS_PROFILE`, then the default profile.
  Env wins, as in gh, AWS, Vercel, and wrangler, so MCP clients can override per spawn. A profile
  may carry an `rpcUrl`; `SOLANA_RPC_URL` still wins and there is still no default RPC.
- **Verification on login.** The CLI instantiates the signer once and stores the resulting
  address, so a bad key or vendor credential fails at login, not at first transaction.
- **Login flows.** Browser login for `privy` (the end-user path); discover-or-paste for `local`
  and `pay`; paste for `privy-server` (operators only).

## Consequences

- MCP client configs need only `SOLOS_PROFILE`; no secrets in `.mcp.json`.
- `solos profiles list|default|remove` manage the file. Removing a profile does not revoke
  anything at the vendor.
- The `pay` provider depends on the `pay` CLI being installed and may prompt for Touch ID.
- An OS keychain backend for the file is an additive later step.
