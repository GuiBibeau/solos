# Publishing to the MCP Registry

The [MCP Registry](https://registry.modelcontextprotocol.io) is where MCP clients and aggregators
discover servers. It holds metadata only; the package itself lives on npm. `server.json` at the
repo root is that metadata, and `@solos-sh/cli`'s `package.json` carries the matching ownership
marker `mcpName`, written by `solos dev pack`.

Publishing is a step of the stable lane (ADR-0036, [docs/releases/README.md](releases/README.md)):
after the smoke from npm passes, the `promote` job of `release-cli.yml` runs
`solos dev release promote x.y.z`, which validates the tag's `server.json` with
`mcp-publisher validate` and publishes it with `mcp-publisher publish`, authenticated through
GitHub OIDC (`mcp-publisher login github-oidc`). The release PR that `solos dev release prepare`
opens is what moves `server.json`'s two version fields to the released npm version.

By hand, when a promotion has to be finished from a workstation:

```sh
# server.json's two version fields must equal the released npm version.
brew install mcp-publisher            # or: see https://github.com/modelcontextprotocol/registry
mcp-publisher login github            # the io.github.GuiBibeau/ namespace needs that GitHub account
mcp-publisher publish                 # reads ./server.json
```

Rules the registry enforces: `name` must equal `mcpName` in the published package, the
description is capped at 100 characters, and the npm version named in `server.json` must exist.
A published version is immutable: a bad one is outlived by the next patch release, or marked
`deprecated` through `PATCH /v0.1/servers/{name}/versions/{version}/status`.

The site's other discovery surfaces (`llms.txt`, `robots.txt`, JSON-LD) are described in
[apps/landing/README.md](../apps/landing/README.md).
