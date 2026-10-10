// @ts-check
import { StrategyRegistry } from "@solos/core";
import { StrategyRequestStateSchema, StrategyStateSchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { errorResponse, invalid, json, readJson } from "./http.js";
import { handleKill } from "./strategy-kill-http.js";

/**
 * @param {Request} request
 * @param {import("./http.js").EngineDeps} deps
 * @param {string} pathname
 */
export const handleStrategy = (request, deps, pathname) => {
  const found = match(request.method, pathname);
  if (found === undefined) return Promise.resolve(errorResponse(unknown(pathname)));
  return found(request, deps);
};

/**
 * @param {string} method
 * @param {string} pathname
 */
const match = (method, pathname) => {
  if (pathname === "/v1/strategies/kill" || pathname.startsWith("/v1/strategies/kill/")) {
    return (/** @type {Request} */ request, /** @type {import("./http.js").EngineDeps} */ deps) =>
      handleKill(request, deps, pathname);
  }
  return collectionRoute(method, pathname) ?? idRoute(method, pathname);
};

/**
 * @param {string} method
 * @param {string} pathname
 */
const collectionRoute = (method, pathname) => {
  if (method === "POST" && pathname === "/v1/strategies") return register;
  if (method === "POST" && pathname === "/v1/strategies/simulate") return simulateRegister;
  if (method === "GET" && pathname === "/v1/strategies") return list;
  return undefined;
};

/**
 * @param {string} method
 * @param {string} pathname
 */
const idRoute = (method, pathname) => {
  const id = strategyId(pathname);
  if (id === undefined) return undefined;
  if (method === "GET" && pathname === `/v1/strategies/${id}`) return get(id);
  if (method === "POST" && pathname === `/v1/strategies/${id}/state`) return update(id);
  if (method === "POST" && pathname === `/v1/strategies/${id}/state/simulate`) {
    return simulateUpdate(id);
  }
  return undefined;
};

/** @param {string} pathname */
const strategyId = (pathname) => {
  const rest = pathname.slice("/v1/strategies/".length);
  const id = rest.split("/", 1)[0];
  if (id === "simulate" || id === "kill" || id === undefined || id.length === 0) return undefined;
  return id;
};

/** @param {string} pathname */
const unknown = (pathname) => invalid("path", `no strategy route ${pathname}`);

/**
 * @param {import("./http.js").EngineDeps} deps
 * @param {import("effect").Effect.Effect<unknown, unknown, import("@solos/core/strategy").StrategyRegistryShape>} effect
 */
const run = (deps, effect) =>
  deps.runtime
    .runPromise(effect)
    .then((value) => json(200, value))
    .catch((error) => errorResponse(error));

/** @param {Request} request @param {import("./http.js").EngineDeps} deps */
const register = async (request, deps) => {
  const body = await readJson(request);
  if (!body.ok) return errorResponse(body.error);
  return run(
    deps,
    Effect.flatMap(StrategyRegistry, (registry) => registry.register(body.value)),
  );
};

/** @param {Request} request @param {import("./http.js").EngineDeps} deps */
const simulateRegister = async (request, deps) => {
  const body = await readJson(request);
  if (!body.ok) return errorResponse(body.error);
  return run(
    deps,
    Effect.flatMap(StrategyRegistry, (registry) => registry.simulateRegister(body.value)),
  );
};

/** @param {Request} request @param {import("./http.js").EngineDeps} deps */
const list = (request, deps) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? undefined;
  const owner = url.searchParams.get("owner") ?? undefined;
  if (state !== undefined && !StrategyStateSchema.safeParse(state).success) {
    return Promise.resolve(errorResponse(invalid("state", `unknown strategy state ${state}`)));
  }
  return run(
    deps,
    Effect.flatMap(StrategyRegistry, (registry) => registry.list({ state, owner })),
  );
};

/** @param {string} id */
const get =
  (id) => (/** @type {Request} */ _request, /** @type {import("./http.js").EngineDeps} */ deps) =>
    run(
      deps,
      Effect.flatMap(StrategyRegistry, (registry) => registry.get(decodeURIComponent(id))),
    );

/**
 * @param {string} id
 * @param {boolean} apply
 */
const change =
  (id, apply) =>
  async (/** @type {Request} */ request, /** @type {import("./http.js").EngineDeps} */ deps) => {
    const body = await readJson(request);
    if (!body.ok) return errorResponse(body.error);
    const state = stateOf(body.value);
    if (typeof state !== "string")
      return errorResponse(invalid("state", "state must be active, paused, or done"));
    const parsed = StrategyRequestStateSchema.safeParse(state);
    if (!parsed.success)
      return errorResponse(invalid("state", "state must be active, paused, or done"));
    const decoded = decodeURIComponent(id);
    const effect = apply ? updateEffect(decoded, parsed.data) : previewEffect(decoded, parsed.data);
    return run(deps, effect);
  };

/** @param {string} id @param {string} state */
const updateEffect = (id, state) =>
  Effect.flatMap(StrategyRegistry, (registry) => registry.update(id, state));

/** @param {string} id @param {string} state */
const previewEffect = (id, state) =>
  Effect.flatMap(StrategyRegistry, (registry) => registry.simulateUpdate(id, state));

/** @param {string} id */
const update = (id) => change(id, true);

/** @param {string} id */
const simulateUpdate = (id) => change(id, false);

/** @param {unknown} value */
const stateOf = (value) =>
  typeof value === "object" && value !== null && "state" in value
    ? /** @type {{ state?: unknown }} */ (value).state
    : undefined;
