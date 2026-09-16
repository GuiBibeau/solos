@AGENTS.md

## Claude Code specifics

- This repo's own MCP server is registered in `.mcp.json` as `solos`. Tool search defers its tools
  by default; search by group (`wallet`, `transfer`) to load them.
- Prefer `bun run solos dev ...` for verification. The commands print JSON you can assert on.
- Live verification against mainnet spends real SOL and is explicitly allowed when the user asks
  for it. Report every signature and amount. Reusable tests must stay on Surfpool.
- After editing code, run `bun run solos dev verify --scope unit --json` before claiming
  completion and include the Evidence JSON it prints. The lint rules are intentionally strict; fix
  the code, do not loosen the rules without an ADR.
