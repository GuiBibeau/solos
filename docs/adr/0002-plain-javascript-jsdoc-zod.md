# 0002 — Plain JavaScript with JSDoc types and Zod schemas

Status: accepted, 2026-09-15

## Context

The team wants raw JavaScript with no build step, but an MCP server and a port-based
architecture are exactly where type mismatches hurt. Effect and the MCP SDK also expect schemas.

## Decision

- `.js` files only. Types come from JSDoc; `tsc --noEmit` with `allowJs`, `checkJs`, `strict`,
  `noUncheckedIndexedAccess` runs as a quality gate. Test files are excluded from `tsc`.
- Zod 4 is the single schema library: MCP tool inputs, AI SDK tool inputs, env, config, domain
  types (`z.infer` typedefs). Effect `Schema` is not used.
- Types that must cross a package boundary are re-exported as `@typedef` lines in the package's
  `index.js`, because `export { X } from` only carries values.
- Formatting: Biome. Linting: ESLint 10 with `eslint-plugin-boundaries`, `import-x`, `unicorn`,
  and hard limits (`complexity` 8, production `max-lines` 150 excluding comments and blanks,
  test `max-lines` 300, `max-lines-per-function` 40, `max-depth` 3, `max-params` 3,
  `max-statements` 20). A separate changed-file gate caps production files at 225 physical lines
  and tests at 300, leaving room for useful JSDoc while preventing unbounded modules. Architecture
  is also enforced by dependency-cruiser.

## Consequences

- Class-based generic sugar from Effect (`Context.Tag("X")<X, S>()`, `Effect.Service`,
  `Schema.Class`) is TypeScript-only syntax and cannot be used. See ADR-0003 for the alternative.
- A handful of unicorn rules that fight JSDoc one-liners or Effect combinators are disabled in
  `eslint.config.js`, each with a comment saying why.
