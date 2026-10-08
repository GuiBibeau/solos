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

## Accessibility

Audited with axe-core and Lighthouse at 360, 640 and 1280 px; keep these when editing:

- Every page starts with a `.skip-link` to `#main`; `main` carries `id="main" tabindex="-1"`.
- Each `nav` has an `aria-label` (Primary, On this page, Tool groups, Footer).
- Anything that scrolls sideways is keyboard-reachable: `pre` and `.table-wrap` carry
  `tabindex="0"`, and a `.table-wrap` is a named `role="region"`. Tables keep `display: table`.
- Inline `code` wraps (`overflow-wrap: anywhere`); nothing may widen the page at 360 px.
- The `$` prompt and step numbers are decorative: `aria-hidden="true"`.
- Focus is one honey ring (`:focus-visible`); link underlines use `--muted` so they are visible;
  `--border-strong` is for boundaries that must be seen (3:1 on `--bg`).
- Link targets in the nav, toc and footer are at least 24 px tall (padding, not font size).

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
