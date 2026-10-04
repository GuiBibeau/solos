# Changesets

Only `@solos-sh/actions` publishes. A pull request that changes `packages/actions/` must add a
changeset: `bun run changeset` (or write `.changeset/<name>.md` by hand with the package name and
`patch | minor | major`). The release workflow opens a "Version Packages" PR on `main`; publishing
to npm stays disabled until `vars.NPM_PUBLISH` is `true` (ADR-0016).
