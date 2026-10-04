// @ts-check
import { taggedError } from "@solos/core/shared";

/** @typedef {{ readonly client: string; readonly scope: string; readonly reason: string; readonly remedy?: string }} ScopeProps */
/** @typedef {new (props: ScopeProps) => import("effect/Cause").YieldableError & { readonly _tag: "ConnectScopeUnsupported" } & Readonly<ScopeProps>} ScopeErrorClass */

/** The client keeps no MCP config at the requested scope: Codex reads only `~/.codex/config.toml`. */
export class ConnectScopeUnsupported extends /** @type {ScopeErrorClass} */ (
  taggedError("ConnectScopeUnsupported")
) {}
