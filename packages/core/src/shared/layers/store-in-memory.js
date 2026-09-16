// @ts-check
import { Effect, Layer, Option } from "effect";
import { Store } from "../ports/store.js";

/**
 * @param {string} namespace
 * @param {string} key
 */
const keyOf = (namespace, key) => `${namespace} ${key}`;

export const StoreInMemory = Layer.sync(Store, () => {
  /** @type {Map<string, unknown>} */
  const map = new Map();
  return {
    get: (namespace, key) => Effect.sync(() => Option.fromNullable(map.get(keyOf(namespace, key)))),
    set: (namespace, key, value) => Effect.sync(() => void map.set(keyOf(namespace, key), value)),
    remove: (namespace, key) => Effect.sync(() => void map.delete(keyOf(namespace, key))),
    list: (namespace) =>
      Effect.sync(() =>
        [...map]
          .filter(([k]) => k.startsWith(`${namespace} `))
          .map(([k, value]) => ({ key: k.slice(namespace.length + 1), value })),
      ),
  };
});
