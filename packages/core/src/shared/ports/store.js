// @ts-check
import { Context } from "effect";

/**
 * Namespaced JSON key-value store.
 * @typedef {{
 *   readonly get: (namespace: string, key: string) => import("effect").Effect.Effect<import("effect").Option.Option<unknown>>;
 *   readonly set: (namespace: string, key: string, value: unknown) => import("effect").Effect.Effect<void>;
 *   readonly list: (namespace: string) => import("effect").Effect.Effect<ReadonlyArray<{ key: string; value: unknown }>>;
 *   readonly remove: (namespace: string, key: string) => import("effect").Effect.Effect<void>;
 * }} StoreShape
 */

export const Store = /** @type {Context.Tag<StoreShape, StoreShape>} */ (
  Context.GenericTag("@solos/shared/Store")
);
