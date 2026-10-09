// @ts-check
import { taggedError } from "@solos/core/shared";

/** @typedef {{ readonly reason: string; readonly remedy: string }} RefusedProps */
/** @typedef {new (props: RefusedProps) => import("effect/Cause").YieldableError & { readonly _tag: "ReleaseRefused" } & Readonly<RefusedProps>} RefusedClass */

/** A release verb refused to act and nothing was published; `remedy` says what to change. */
export class ReleaseRefused extends /** @type {RefusedClass} */ (taggedError("ReleaseRefused")) {}
