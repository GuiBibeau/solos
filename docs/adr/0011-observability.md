# 0011 — Effect logging to stderr, spans everywhere, OTel as a Layer

Status: accepted, 2026-09-15

## Context

A stdio MCP server must keep stdout clean for JSON-RPC. The bigger stack has (or will have) a
collector for traces and logs; solOS should feed it without owning it.

## Decision

- Effect's logger with a JSON format on stderr (`LoggerJsonStderr(level)`), level from
  `SOLOS_LOG_LEVEL`. Tool calls and transaction signatures at `info`, arguments at `debug`.
  Key material never reaches a log by construction: the `Signer` port exposes only an address.
- Every use case, adapter RPC call, and tool invocation runs inside `Effect.withSpan`.
- `TracingLive(endpoint, serviceName)` in the harness is `Layer.empty` unless
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set, in which case spans export over OTLP/HTTP via
  `@effect/opentelemetry`. Traces exist the moment an endpoint appears.
- Errors are structured (`_tag` + props). At boundaries they become `{ code, ...props }`; defects
  become `InternalError` without stack traces.

## Consequences

- Logs are greppable JSON in every environment.
- A local log sink (`EventSink` to sqlite) is deferred; the port exists as a no-op.
