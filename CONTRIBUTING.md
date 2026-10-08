# Contributing to solOS

Thanks for looking. solOS is small on purpose: a thin execution layer, strict lint rules, and a
single CLI that doubles as the verification tool. This page is the short version;
[AGENTS.md](AGENTS.md) is the full contributor guide and the source of truth for conventions.

## Before you start

- **Bugs and small fixes:** open an issue with the [bug template](https://github.com/GuiBibeau/solos/issues/new/choose),
  or a pull request straight away if the fix is obvious.
- **New tools, venues or slices:** open a [change](https://github.com/GuiBibeau/solos/issues/new/choose)
  issue first. Design decisions live in [docs/adr](docs/adr/README.md); a new capability usually
  needs one.
- **First time here?** Issues labelled
  [good first issue](https://github.com/GuiBibeau/solos/labels/good%20first%20issue) are scoped
  for one focused change.
- **Security problems** go through [SECURITY.md](SECURITY.md), never a public issue.

## Set up

```sh
git clone https://github.com/GuiBibeau/solos && cd solos
bun install                      # Bun 1.3 or later; never plain `bun install -g` upgrades
bun run solos dev surfpool up    # local Solana fork for integration tests
bun run solos dev check          # format, lint, dependency rules, types
bun run solos dev test           # unit + integration against Surfpool
```

Reusable tests never touch mainnet. Surfpool starts itself when a test needs it.

## Making a change

1. Branch from `main`.
2. Follow the layout in [AGENTS.md](AGENTS.md#where-things-live): zero I/O in `packages/core`,
   Kit only in `packages/solana`, every execute tool with a simulate twin.
3. Keep files under the line limits (150 logical / 225 physical for production files). The
   check fails on changed files that exceed them; split, do not loosen the rule.
4. Run `bun run solos dev verify --scope unit --json` on the exact commit you push.
5. Paste the JSON it prints into the pull request body under `## Evidence`. CI checks that the
   `sha` matches the PR head, `dirty` is false and `ok` is true, then re-runs the same command.

A description of what you ran is not evidence. The JSON is.

## Style

- Plain `.js` with JSDoc types, `tsc --noEmit` strict, no build step.
- Effect for ports, adapters and use cases. Zod 4 for every schema.
- Errors are tagged, structured, and translated at adapter boundaries.
- Tools are named `solana_<group>_<verb>_<object>` and every argument is `.describe()`d.

`bun run solos dev check` enforces all of this. Fix the code rather than the rule; a rule change
needs an ADR.

## Live validation

Execute paths are validated with a real mainnet spend the operator authorises. Contributors do
not need to do this. If your change touches an execute path, say so in the PR and the maintainer
runs the live round and records it in [features/feature-map.json](features/feature-map.json).

## License

By contributing you agree that your contributions are licensed under the
[Apache-2.0](LICENSE) license that covers the project.
