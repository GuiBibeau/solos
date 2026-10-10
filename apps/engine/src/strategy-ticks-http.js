// @ts-check
import { StrategyRegistry } from "@solos/core";
import { Effect } from "effect";
import { errorResponse, json } from "./http.js";

/**
 * @param {string} id
 * @returns {(request: Request, deps: import("./http.js").EngineDeps) => Promise<Response>}
 */
export const listStrategyTicks = (id) => async (request, deps) => {
  const url = new URL(request.url);
  const limit = limitOf(url.searchParams.get("limit"));
  const outcome = url.searchParams.get("outcome") ?? undefined;
  const decoded = decodeURIComponent(id);
  try {
    const value = await deps.runtime.runPromise(
      Effect.flatMap(StrategyRegistry, (registry) =>
        registry.ticks({ id: decoded, ...(limit !== undefined && { limit }), ...(outcome !== undefined && { outcome }) }),
      ),
    );
    return json(200, value);
  } catch (error) {
    return errorResponse(error);
  }
};

/** @param {string | null} value */
const limitOf = (value) => (value === null ? undefined : Number(value));
