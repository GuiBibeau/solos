# 0036 — Release lanes: canary on every merge, stable through a reviewed release PR, promotion by pointer; every tool carries a stability label

Status: accepted, 2026-10-09. Extends ADR-0035 (one compiled binary, tag-driven release) and
ADR-0029 (tools are withheld until asked for).

## Context

ADR-0035 gave the project one lane: a `solos@x.y.z` tag on `main` builds the four binaries and
publishes a GitHub Release and five npm packages straight to `latest`. Everything merged since
0.1.0 on 2026-10-04 is invisible to users until someone chooses a version and pushes a tag, and
a bad release can only be replaced by a rebuild. The operator asked for the shape Vercel gives a
web project: every merge deploys somewhere people can try, production moves by promotion, and a
rollback is a pointer flip. He also asked that stable and major releases happen only after a
proper review, that promotion itself be automatic once a release passes its checks, and that
features carry labels such as *experimental* the way Vercel products do.

A compiled binary is not a web deployment: npm versions are immutable and never deleted, a
version string is baked into the artifact at build time, and the MCP Registry holds metadata for
published versions only. The lanes below are built from what those facts allow.

## Decision

### Three lanes and a pointer

- **Preview, per pull request.** The build matrix runs on every pull request that changes code
  and uploads each binary as a workflow artifact `solos-<target>-pr<n>`, kept seven days. One
  sticky comment lists them with the `gh run download` command; a pull request that changes no
  code says so instead of building. Nothing is published. Pull requests are maintainer-only
  (CONTRIBUTING.md), so `gh run download` is the audience.
- **Canary, on every merge to `main`.** The version is derived, never typed:
  `<next patch of the newest solos@ tag>-canary.<run>.g<short sha>`, where `<run>` is the
  workflow run number so canaries order correctly. The lane publishes the launcher and the four
  platform packages under the npm dist-tag `canary` and a GitHub pre-release `solos@<version>`
  with binaries and `SHA256SUMS`. `npm i -g @solos-sh/cli@canary` and
  `SOLOS_CHANNEL=canary` on `install.sh` select it. Canaries never reach the MCP Registry. The
  nightly workflow prunes pre-releases past the newest twenty; npm keeps every version.
- **Stable, through a release PR.** `solos dev release prepare --bump patch|minor|major` opens
  a branch `release/x.y.z` whose only changes are `server.json`'s two version fields and
  `docs/releases/x.y.z.md`: the notes, generated from the merged PRs since the last tag and the
  stability-label changes, then edited by hand. That PR is where the review happens. A major
  must also carry a `## Migration` section and name the ADR that justifies it; `solos dev
  release check` enforces both in CI and the PR cannot merge without them. `prepare` ships with
  the stable lane (#223); until then the release PR is made by hand with `version`, `notes` and
  `check`. Merging the release PR is the approval: a workflow tags `solos@x.y.z` at the merge commit, and the tag runs the
  release as ADR-0035 describes, with one change: npm publishes under the dist-tag `staged`
  and the GitHub Release is created as a pre-release. That change to `release-cli.yml` lands
  with the lanes (#222, #223); until then a pushed `solos@x.y.z` tag still publishes straight to
  `latest`, so no tag is pushed before they land.
- **Promotion is automatic and is a pointer flip.** A job installs `@solos-sh/cli@x.y.z` from
  npm on each platform runner and runs `solos --version`, `solos mcp list` and `solos doctor`.
  When all four pass, `solos dev release promote x.y.z` moves `latest` on all five
  packages, marks the GitHub Release latest, and publishes `server.json` to the MCP Registry
  with `mcp-publisher`. No human gate: the review happened on the release PR. A failed smoke
  leaves the version on `staged`, visible, installable by exact version, and not `latest`.
- **Rollback is the same flip in reverse, except for the registry.** `solos dev release
  rollback --to x.y.z --from a.b.c` points `latest` and the GitHub Release at a previous version and
  deprecates the bad one on npm with the reason. No rebuild. The MCP Registry is left alone: its
  versions are immutable and an existing version cannot be published again, so the registry
  cannot point backwards. The rolled-back version stays listed until a fix-forward patch release
  is promoted, which is the remedy the command prints. `promote` asks the registry about the
  version first, deleted entries included, and promotes only a version the registry lists as
  active: a deleted one cannot be published again, a deprecated one carries a warning, and
  neither may become `latest`. The registry's supported operation is
  `PATCH /v0.1/servers/{name}/versions/{version}/status` to mark the bad version `deprecated`
  with a message; it needs the publisher's token, so the stable-lane workflow runs it, not the
  lever on a laptop.

The release mechanics are lever commands under `solos dev release`, so the workflows call
`solos` and CI arithmetic lives in tested code, not YAML.

### What a running binary says about itself

`solos --version` prints the full version string. `solos doctor` adds a `release` object with
`version`, `lane` and `commit`; the MCP server's `serverInfo.version` carries the same version.
The lane is derived from the version: a `canary` prerelease identifier means `canary`, any other
version means `stable`, and `0.0.0` means `source` (a checkout). The build defines the commit
beside the version. There is no separate channel file to drift.

### Stability labels on tools

- Every tool declares `stability: "experimental" | "beta" | "stable"` in `defineTool`; the
  registry test refuses a tool without one.
- The label is the compatibility promise, and it binds the release lanes: a **stable** tool's
  name, arguments, result keys and tier change only in a major, with a Migration note; a
  **beta** tool may change in a minor, and the release notes say so; an **experimental** tool
  may change or disappear in any release.
- An execute or simulate tool may be `stable` only when its Action has a `live-validated` row in
  `features/feature-map.json`. The tool names the Action type it builds in `action`; that is how
  the docs gate finds the row, so a label cannot outrun a funded round. Read tools are labelled
  by the maintainer and the rule for them is written in the tool's issue.
- Exposure follows the label the way it follows the tier (ADR-0029, ADR-0033): `stable` and
  `beta` tools register as today; `experimental` tools register only when the server starts with
  `--features experimental` (or `SOLOS_FEATURES=experimental`, which `solos connect --features
  experimental` writes into the client config); `solos agent run --features experimental` is
  the same gate on the agent loop. Discovery still names a withheld experimental
  tool, marks it unavailable and says how to turn it on, exactly as it does for a tool above the
  tier ceiling.
- The label is rendered wherever a tool is described: the generated reference tables, the
  landing's tool page and `llms-full.txt`, `solos mcp list`, and a suffix on the MCP description
  for `beta` and `experimental` tools so an agent sees it without a side channel.
- Initial assignment: a tool whose Action has a live-validated row is `stable`; every other
  shipped tool is `beta`; nothing is `experimental` on the day the label lands.

## Consequences

- Every merge becomes installable within minutes, under a name that says it is a canary, and
  `latest` moves only after a reviewed release PR and a smoke test from the registry itself.
- Majors are rarer and slower by design: an ADR, a Migration section and a reviewed PR stand in
  front of them, which is the review the operator asked for.
- A rollback takes one command and leaves evidence (the deprecation message) rather than a
  rebuilt artifact. It does not reach the MCP Registry; a bad registry entry is outlived by the
  next patch release.
- npm accumulates five versions per merge. That is the price of the canary lane; the pruning
  applies to GitHub pre-releases only.
- Agents and users can tell a promise from an experiment by reading the tool, and the project
  can ship an unfinished tool behind `--features experimental` without lying about it.
- `features/feature-map.json` gains a second consumer: it now decides which execute paths may
  call themselves stable.
- The release PR replaces the hand-pushed tag as the unit of a stable release; `install.sh`
  keeps `SOLOS_VERSION` for an exact pin and adds `SOLOS_CHANNEL` for a lane.
