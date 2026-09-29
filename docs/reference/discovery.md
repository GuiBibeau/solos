# Free-text tool selection

Discovery takes a request in the Caller's own words and ranks the tool registry against it
([ADR-0029](../adr/0029-jit-tool-discovery.md)). Group and explicit-name lookups are exact and
never reach a selector; only free text does.

## Recommendation: set `AI_GATEWAY_API_KEY`

With a Vercel AI Gateway key, JEV ranks the registry. JEV is TypeSafe AI's System One
evaluation model, served on the gateway as `typesafe-ai/jev`. It is built for this shape of
problem: one structured choice over up to 255 options, rather than generated text. It is the
same key the harness's model router uses, so an Operator who already has one needs nothing else.

Without the key, the local deterministic matcher ranks instead. It needs no network. A request
word counts at the weight of the strongest field it appears in: name or group, then title, then
description.

The key also sends something off the machine. Each free-text request goes to the gateway, and
through it to TypeSafe, together with every tool's name, title and description. The request text
is the Caller's, and nothing else about the wallet or the session travels.

## The result always says who ranked it

A selection names its selector. When JEV could not answer, the local matcher ranks instead and
`fallback` says why:

- **No key.** `AI_GATEWAY_API_KEY` is not set. The request fails before any HTTP.
- **An error.** The reason gives the HTTP status or the error class, never the provider's text.
- **No answer in time.** JEV has 2 s by default; after that the request is matched locally.
- **An answer without a known tool choice.** A probability map that is empty or names no
  registry tool still ranks JEV's bare `choice` when that is a known tool; otherwise the request
  is matched locally.

Selection never fails once its bounds are valid. `--limit` must be a whole number of matches,
zero or more, and the timeout a whole number of milliseconds, one or more; anything else is
refused as `SelectionInputInvalid` before any selector runs.

```sh
bun run solos discovery select --query "swap SOL for USDC"
```

```json
{"query":"swap SOL for USDC","selector":"jev","matches":[{"name":"solana_swap_execute_swap","score":0.93},{"name":"solana_swap_simulate_swap","score":0.05},{"name":"solana_swap_get_quote","score":0.02}],"matched":3}
```

`matches` holds at most eight entries by default (`--limit`). `matched` counts every tool that
scored above zero, so a Caller can say that more matched.

## Measured on 2026-09-28

These figures come from a workstation on a slow link in Asia, over the 48-tool registry, with
tool titles as the options:

- **Cost:** about 1,356 input tokens per selection, about $0.00006. Output is not billed.
- **Latency:** TypeSafe's own endpoint answered in 240–360 ms. End to end took 0.56–0.66 s,
  because the gateway served these calls from Frankfurt.
- **Accuracy:** requests with a clear tool picked it at 0.87–0.96. A request no tool covers gave
  a flat distribution, with a top probability of 0.30.
- **Titles, not descriptions:** the options are tool titles. Adding each description sent 7,258
  input tokens instead of 1,356, 5.4 times the cost, and JEV picked the same tools. So the adapter
  sends titles, while the local matcher, which costs nothing, reads descriptions too.

By default the gateway tries a DigitalOcean-hosted JEV first. That host answered 503 on every
call, costing about 270 ms each time before the fallback. The adapter therefore asks for
TypeSafe's endpoint first.
