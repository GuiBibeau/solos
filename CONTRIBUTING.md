# Contributing to solOS

solOS signs and sends real transactions on behalf of an agent. That shapes how the project is
maintained, and it is the first thing to know before you spend time on a change.

## Pull requests are maintainer-only

The project does not accept pull requests from outside the project. Every execute path in solOS
is validated by the maintainer with a real mainnet spend before it ships, and the maintainer
answers for every line that can move funds. In that security environment, code written outside
the project is a risk we do not take, however good it is: reviewing it to the standard the money
paths need would cost more than writing it. A workflow closes external pull requests
automatically with this explanation; it is not a judgement of the change.

The licence is Apache-2.0. Fork, change and ship your own build freely.

## What helps

- **Bug reports** with a reproduction: the command or tool call, the JSON it printed, what you
  expected. Use the [bug template](https://github.com/GuiBibeau/solos/issues/new/choose). Never
  paste keys, RPC URLs that carry a key, or `~/.config/solos/credentials.json`.
- **Change requests** through the [change template](https://github.com/GuiBibeau/solos/issues/new/choose):
  what the agent could not do, on which venue, and what it should have returned.
- **Security problems**, privately, through [SECURITY.md](SECURITY.md). Never in a public issue.
- **Documentation mistakes**: an issue pointing at the line is enough.

Issues are read by the maintainer, who builds the change, tests it on Surfpool, live-validates it
on mainnet when money moves, and records that round in
[features/feature-map.json](features/feature-map.json).

## Working in this repository

The rest of this page is for the maintainer and for agents working in this checkout.
[AGENTS.md](AGENTS.md) is the full guide and the source of truth for conventions.

### Set up

```sh
git clone https://github.com/GuiBibeau/solos && cd solos
bun install                      # Bun 1.3 or later; never plain `bun install -g` upgrades
bun run solos dev surfpool up    # local Solana fork for integration tests
bun run solos dev check          # format, lint, dependency rules, types
bun run solos dev test           # unit + integration against Surfpool
```

Reusable tests never touch mainnet. Surfpool starts itself when a test needs it.

### Making a change

1. Branch from `main`.
2. Follow the layout in [AGENTS.md](AGENTS.md#where-things-live): zero I/O in `packages/core`,
   Kit only in `packages/solana`, every execute tool with a simulate twin.
3. Keep files under the line limits (150 logical / 225 physical for production files). The
   check fails on changed files that exceed them; split, do not loosen the rule.
4. Run `bun run solos dev verify --scope unit --json` on the exact commit you push.
5. Paste the JSON it prints into the pull request body under `## Evidence`. CI checks that the
   `sha` matches the PR head, `dirty` is false and `ok` is true, then re-runs the same command.

A description of what you ran is not evidence. The JSON is.

### Style

- Plain `.js` with JSDoc types, `tsc --noEmit` strict, no build step.
- Effect for ports, adapters and use cases. Zod 4 for every schema.
- Errors are tagged, structured, and translated at adapter boundaries.
- Tools are named `solana_<group>_<verb>_<object>` and every argument is `.describe()`d.

`bun run solos dev check` enforces all of this. Fix the code rather than the rule; a rule change
needs an ADR.

### Live validation

Execute paths ship only after a real mainnet spend the operator authorises, reconciled before and
after, and recorded in [features/feature-map.json](features/feature-map.json) in the same change
set as the QA notes. Offline tests do not stand in for that round.
