---
"@solos/actions": patch
---

Fix `AddressSchema` to accept only strings that base58-decode to exactly 32 bytes. Strings it previously accepted but that are not valid Solana pubkeys (wrong decoded byte length) now fail validation at the tool boundary with a typed input error instead of surfacing as transport errors from the RPC provider.
