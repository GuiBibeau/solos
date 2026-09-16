// @ts-check
import { Data } from "effect";

/**
 * Constructor type for a tagged error carrying structured props.
 * @template {string} Tag
 * @template {Record<string, unknown>} Props
 * @typedef {new (props: Props) => import("effect/Cause").YieldableError & { readonly _tag: Tag } & Readonly<Props>} TaggedErrorClass
 */

/**
 * JS-friendly wrapper around `Data.TaggedError`. The class-based generic form is
 * TypeScript-only syntax, so slices declare errors by extending a cast call:
 * `class X extends (cast to TaggedErrorClass<"X", Props>) (taggedError("X")) {}`.
 * @template {string} Tag
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {Tag} tag
 * @returns {TaggedErrorClass<Tag, Props>}
 */
export const taggedError = (tag) =>
  /** @type {TaggedErrorClass<Tag, Props>} */ (/** @type {unknown} */ (Data.TaggedError(tag)));
