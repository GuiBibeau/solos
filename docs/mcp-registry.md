# Publishing to the MCP Registry

The [MCP Registry](https://registry.modelcontextprotocol.io) is where MCP clients and aggregators
discover servers. It holds metadata only; the package itself lives on npm. `server.json` at the
repo root is that metadata, and `@solos-sh/cli`'s `package.json` carries the matching ownership
marker `mcpName`, written by `solos dev pack`.

After a release has published `@solos-sh/cli` to npm:

```sh
# server.json's two version fields must equal the released npm version.
brew install mcp-publisher            # or: see https://github.com/modelcontextprotocol/registry
mcp-publisher login github            # the io.github.GuiBibeau/ namespace needs that GitHub account
mcp-publisher publish                 # reads ./server.json
```

Rules the registry enforces: `name` must equal `mcpName` in the published package, the
description is capped at 100 characters, and the npm version named in `server.json` must exist.
The release workflow could run `mcp-publisher publish` with GitHub OIDC once the version bump is
automated; today it is a manual step after `solos@<version>` is tagged.

The site's other discovery surfaces (`llms.txt`, `robots.txt`, JSON-LD) are described in
[apps/landing/README.md](../apps/landing/README.md).
