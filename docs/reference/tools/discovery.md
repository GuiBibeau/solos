# Discovery

Part of the [tool reference](index.md). How free text is ranked, and the measurements behind the
JEV recommendation, are in [discovery](../discovery.md).

## The search tool

`solana_discovery_search_tools` is the one tool a fresh MCP server advertises besides
`solana_wallet_get_balance` and `solana_portfolio_get_state`. Every other tool the tier ceiling
permits and the feature flags enable is registered but withheld until a search asks for it
([ADR-0029](../adr/0029-jit-tool-discovery.md)). Tools labelled `experimental` register only
when the server runs with `--features experimental` or `SOLOS_FEATURES=experimental`
([ADR-0036](../adr/0036-release-lanes-and-stability-labels.md)).

One search takes exactly one of:

- **`query`** — the request in the Caller's own words. Ranked by JEV when `AI_GATEWAY_API_KEY`
  is set, by the local matcher otherwise; the result says which (`selector`, `fallback`).
- **`group`** — one group, listed in full: `discovery`, `launch`, `lend`, `liquidity`, `market`,
  `perp`, `portfolio`, `swap`, `transfer` or `wallet`.
- **`names`** — exact tool names. Names that are not tools come back in `unknown`.

`limit` (default 8) caps how many matches are listed; `matched` counts them all.

## What comes back

Every match carries `name`, `group`, `title`, `tier`, `stability`, `available` and, for a
query, `score`. `available: false` means the tool exists but this server withholds it: it sits
above the tier ceiling, or it is `experimental` and the feature is not enabled. It is never
dropped silently. On the MCP server, `enabled` lists the tools this call made callable, and the
client receives `tools/list_changed`, so each arrives with its real schema and annotations.

`notes` say what to do next, in fixed wording:

- more matched than were listed, and how to see the rest;
- nothing matched, and the groups solOS does cover;
- some names were not tools;
- matches exist above the ceiling, and the `--tier` value that would admit them;
- matches are experimental and not enabled, and `--features experimental` would enable them. A
  tool behind both gates appears in both notes.

Giving two modes at once, or none, is refused as `SelectionInputInvalid`.

## Advertising everything

`--tools all` on the server command line, or `SOLOS_TOOLS=all` in its env, disables discovery
and advertises every tool the ceiling permits and the feature flags enable up front. Clients that
ignore `tools/list_changed` need it; the flag wins when both are set. `solos mcp call` behaves as
a Caller would: a tool that is not advertised is searched for by name first, and a tool above
the ceiling or behind the experimental gate returns the search result that says so.
