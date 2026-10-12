# Contributing to solOS

solOS is a personal project. Outside pull requests and contributions are not accepted. A workflow
closes pull requests opened from outside this repository.

Bug reports use the
[bug template](https://github.com/GuiBibeau/solos/issues/new?template=bug.yml): the command or
tool call, the JSON it printed, and what you expected. Do not paste keys, RPC URLs that carry a
key, or `~/.config/solos/credentials.json`. There is no template for questions, and blank issues
are disabled. Security problems go through [SECURITY.md](SECURITY.md), never a public issue.

The licence is Apache-2.0. Starring the repository is fine, and so is forking it and shipping
your own build.

## Maintainer workflow

The rest of this page is for the maintainer working in this checkout.
[AGENTS.md](AGENTS.md) is the full guide.

### Set up, test, build

```sh
git clone https://github.com/GuiBibeau/solos && cd solos
bun install
bun run solos dev surfpool up    # local Solana fork for integration tests
bun run solos dev check          # line limits, docs, format, lint, dependency rules, types
bun run solos dev test           # unit + integration against Surfpool
bun run solos dev build          # compile the binary
```

Bun 1.3 or later. Reusable tests never touch mainnet. Surfpool starts itself when a test needs
it.

### Evidence

On the commit you push, run `bun run solos dev verify --scope unit --json` and paste the JSON
into the pull request body under `## Evidence`. CI accepts a `sha` that is that commit, the
literal `HEAD`, or an ancestor whose later commits change only docs. `dirty` must be false and
`ok` must be true. The verify job runs scope `check` for a docs-only pull request and scope
`full` otherwise.

### Changesets

Only `@solos-sh/actions` publishes. A pull request that changes `packages/actions/` adds a
changeset with `bun run changeset`, or a hand-written `.changeset/<name>.md` naming the package
and `patch`, `minor`, or `major`. See [.changeset/README.md](.changeset/README.md).

### Live validation

Execute paths ship after a real mainnet spend the operator authorises, reconciled before and
after, and recorded in [features/feature-map.json](features/feature-map.json) in the same change
as the QA notes. Offline tests do not stand in for that round.
