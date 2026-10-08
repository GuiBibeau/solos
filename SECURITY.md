# Security policy

solOS signs and sends Solana transactions on behalf of an agent. Anything that could make it sign
something the operator did not intend, leak a key or a secret, or send when it should only have
simulated, is a security issue.

## Reporting

**Do not open a public issue.** Use GitHub's private vulnerability reporting:

<https://github.com/GuiBibeau/solos/security/advisories/new>

Include the version (`solos --version` or the commit sha), the signer provider (local, Privy, pay),
the tier the server ran at, and a reproduction. Never paste keypairs, RPC URLs with keys, or
`~/.config/solos/credentials.json` into a report.

You will get an acknowledgement within five business days. Fixes ship as a patch release with a
GitHub security advisory crediting the reporter, unless you ask otherwise.

## Scope

In scope:

- Key and credential handling: `solos login`, profiles, client configs written by `solos connect`.
- The tier ceiling: an execute tool reachable below `--tier execute`, or a simulate tool that can
  land a transaction on chain (ADR-0033).
- Simulation and spend bounds: a swap or perp path that sends without the measured bound it
  promised, or a `skipSimulation` default that differs from the documented one.
- Submission: the lifetime, probe and guard logic in `packages/solana/src/submission/`.
- The MCP server's stdio boundary and anything that lets tool arguments reach a shell.

Out of scope:

- The on-chain programs of the venues solOS talks to (Jupiter, Kamino, Orca, Raydium, Meteora,
  Phoenix, Pump). Report those to the venue.
- Agent behaviour. solOS carries no policy by design (ADR-0006); an agent that spends within the
  ceiling you set is doing what you configured.
- Denial of service against third-party RPC or API endpoints.

## Supported versions

Only the latest release on npm (`@solos-sh/cli`) and `main` receive fixes.
