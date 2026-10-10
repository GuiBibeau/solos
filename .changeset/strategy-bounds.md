---
"@solos-sh/actions": minor
---

Add Engine-wide and per-strategy Bounds schemas. Engine bounds are a UTC-day USD spend cap and mint and venue allowlists. Strategy bounds add a per-tick notional cap, an expiry and a consecutive-failure limit. A strategy allowlist narrows the engine allowlist and never widens it. Caps are non-negative decimal strings.
