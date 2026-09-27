// @ts-check
import { Data } from "effect";

/**
 * `reason` says what is wrong, precisely; `remedy` says what to do about it, concretely. Every
 * domain error may carry a remedy, and it is optional on purpose: omit it when no action exists,
 * and never restate the reason in different words. Both fields reach MCP clients and CLI callers
 * as siblings of `code` (see `error-envelope.js`).
 * @typedef {{ readonly remedy?: string }} RemedyProps
 */

/**
 * Constructor type for a tagged error carrying structured props plus an optional remedy.
 * @template {string} Tag
 * @template {Record<string, unknown>} Props
 * @typedef {new (props: Props & RemedyProps) => import("effect/Cause").YieldableError & { readonly _tag: Tag } & Readonly<Props & RemedyProps>} TaggedErrorClass
 */

/** @typedef {new (props: Record<string, unknown>) => { readonly _tag: string } & Record<string, unknown>} AnyTaggedErrorClass */

/** Every error type `taggedError` has produced, keyed by tag. See `domainErrors`. @type {Map<string, AnyTaggedErrorClass>} */
const errorsByTag = new Map();

/**
 * JS-friendly wrapper around `Data.TaggedError`. The class-based generic form is
 * TypeScript-only syntax, so slices declare errors by extending a cast call:
 * `class X extends (cast to TaggedErrorClass<"X", Props>) (taggedError("X")) {}`.
 *
 * Creating a class also registers it, so the error surface can be enumerated without a hand-kept
 * list: importing a slice's `index.js` is enough to make its errors show up in `domainErrors`.
 * @template {string} Tag
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {Tag} tag
 * @returns {TaggedErrorClass<Tag, Props>}
 */
export const taggedError = (tag) => {
  const ErrorClass = /** @type {TaggedErrorClass<Tag, Props>} */ (
    /** @type {unknown} */ (Data.TaggedError(tag))
  );
  errorsByTag.set(tag, /** @type {AnyTaggedErrorClass} */ (/** @type {unknown} */ (ErrorClass)));
  return ErrorClass;
};

/**
 * Every tagged error type registered so far, sorted by tag: the order a slice happens to be
 * imported is not a contract. Populated as slice error modules load, so importing the package
 * index registers all of them.
 * @returns {ReadonlyArray<{ tag: string; ErrorClass: AnyTaggedErrorClass }>}
 */
export const domainErrors = () =>
  [...errorsByTag]
    .map(([tag, ErrorClass]) => ({ tag, ErrorClass }))
    .toSorted((a, b) => a.tag.localeCompare(b.tag));
