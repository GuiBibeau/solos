# 0009 — Task classes, provider-neutral presets, gateway fallbacks

Status: accepted, 2026-09-15

## Context

The harness must switch between Anthropic and OpenAI current-generation models without code
changes, with no provider privileged in code, and survive a provider outage.

## Decision

- Three task classes: `fast`, `default`, `reasoning`.
- Two presets in `apps/harness/src/router/presets.js`, selected by `ROUTER_PRESET`
  (`anthropic` default only because a default is needed; `openai` is one env var away):

  | class | anthropic | openai | reasoning |
  |---|---|---|---|
  | fast | `anthropic/claude-haiku-4.5` | `openai/gpt-5.6-luna` | none |
  | default | `anthropic/claude-sonnet-5` | `openai/gpt-5.6-sol` | low |
  | reasoning | `anthropic/claude-fable-5.1` | `openai/gpt-6-astra` | high |

- `harness.config.js` overrides any class (`model`, `reasoning`, `fallbacks`).
- Cross-provider fallback on by default: each route's `fallbacks` includes the other preset's
  model for the same class, passed as `providerOptions.gateway.models`.
- Model ids are gateway strings resolved by the AI Gateway provider bundled in `ai`; auth is
  `AI_GATEWAY_API_KEY`. The unified `reasoning` option is translated per provider by the gateway
  and carried across fallbacks.
- Agent loop: `ToolLoopAgent` with `stopWhen: isStepCount(config.agent.maxSteps)`,
  `toolApproval` off (ADR-0006), `prepareStep` for active tool groups.

## Consequences

- `resolveRoute` is pure and unit-tested; model ids change in one file.
- Validating ids against the live gateway catalog is a follow-up (`gateway.getAvailableModels()`).
