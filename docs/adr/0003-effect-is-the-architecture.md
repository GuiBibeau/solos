# 0003 — Effect Tags and Layers are the ports-and-adapters mechanism

Status: accepted, 2026-09-15

## Context

Hexagonal architecture needs a way to declare ports and inject adapters. Effect already ships one:
a port is a `Context.Tag`, an adapter is a `Layer`, a use case is an `Effect` that requires the
tag. Hand-rolling interfaces and factories next to Effect would be two DI systems.

## Decision

Effect is the architecture, not an implementation detail.

- **Port**: `export const Signer = /** @type {Context.Tag<SignerShape, SignerShape>} */ (Context.GenericTag("@solos/wallet/Signer"))`,
  one file per port in `ports/`, shape declared as a `@typedef`. Identifiers are namespaced
  `@solos/<slice>/<Port>`.
- **Adapter**: `Layer.succeed | Layer.effect | Layer.scoped` providing a port. Named `<Port>Live`.
- **Use case**: an `Effect.gen` in `use-cases/`, wrapped in `Effect.withSpan("<slice>.<name>")`.
- **Errors**: `Data.TaggedError` via the `taggedError("Name")` helper in
  `shared/domain/tagged-error.js`, cast to `TaggedErrorClass<"Name", Props>`. One class per cause,
  in the owning slice's `domain/errors.js`. Props are structured; the field is `reason`, never
  `cause`, because `Error.cause` is non-enumerable and vanishes from serialised output.
- **Composition roots** are the only places `Layer.provide`, `ManagedRuntime.make`, or
  `Effect.run*` appear: `packages/mcp/src/runtime.js` + `bin/stdio.js`,
  `apps/harness/src/composition.js`, `apps/cli/src/runtime.js`, and tests.

## Consequences

- Every package depends on `effect`. Promise-based code exists only at the outermost edges
  (MCP handlers, AI SDK `execute`, CLI output).
- Typed error channels flow from adapters to tool results without try/catch.
- `Effect.Service` auto-layers are unavailable; a Layer per adapter is written by hand.
