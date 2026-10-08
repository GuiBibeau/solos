# @solos/landing

The solOS landing site: a home page, a short docs page and the tool reference. Plain HTML and
CSS under `public/`, no build step, no framework. Soleebee from `docs/assets` is the brand mark.

The tool list in `public/tools.html` sits between `<!-- generated: tools -->` markers and is
rendered from the registry by `bun run solos dev docs check --write`; `solos dev check` fails
when it drifts. Do not edit that block by hand.

```sh
bun run landing            # serves public/ on http://localhost:4173 (PORT overrides)
```

Deploy by pointing any static host at `apps/landing/public`. Links use `.html` so no rewrite
rules are needed.

## Discovery

- `llms.txt` is the agent-facing index ([llmstxt.org](https://llmstxt.org)); `llms-full.txt`
  carries the whole tool catalogue as Markdown, generated from the registry between
  `<!-- generated: tools -->` markers like `tools.html`.
- `robots.txt` allows every crawler and names the AI ones; `sitemap.xml` lists the pages.
- Each page has a canonical URL, Open Graph and Twitter cards (`og.png`, 1200x630) and JSON-LD
  (`WebSite`, `SoftwareApplication`, `TechArticle`, `APIReference`).
- The MCP Registry manifest is `server.json` at the repo root; publishing is described in
  [docs/mcp-registry.md](../../docs/mcp-registry.md).
- The site URL is assumed to be `https://solos.sh`. It appears in the canonical and Open Graph
  tags, the JSON-LD, `robots.txt`, `sitemap.xml` and `llms.txt`. To change it:
  `sed -i '' 's#https://solos.sh#https://your.domain#g' apps/landing/public/*`
