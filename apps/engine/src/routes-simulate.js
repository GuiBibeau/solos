// @ts-check
import { ActionSchema } from "@solos-sh/actions";
import { errorResponse, invalid, json, readJson } from "./http.js";
import { observed } from "./observe.js";
import { tierRefusal } from "./tier.js";

/**
 * @param {Request} request
 * @param {import("./http.js").EngineDeps} deps
 */
export const simulateRequest = async (request, deps) => {
  const body = await readJson(request);
  if (!body.ok) return errorResponse(body.error);
  const parsed = ActionSchema.safeParse(actionOf(body.value));
  if (!parsed.success) return errorResponse(invalid("action", "action did not match the schema"));
  const refusal = tierRefusal(deps.tier, "simulate");
  if (refusal !== undefined) return errorResponse(refusal);
  return runSimulate(deps, parsed.data);
};

/**
 * @param {import("./http.js").EngineDeps} deps
 * @param {import("@solos-sh/actions").Action} action
 */
const runSimulate = async (deps, action) => {
  try {
    const result = await deps.runtime.runPromise(
      observed(deps.executor.simulate(action), "simulate"),
    );
    return json(200, result);
  } catch (error) {
    return errorResponse(error);
  }
};

/** @param {unknown} body */
const actionOf = (body) =>
  typeof body === "object" && body !== null && "action" in body
    ? /** @type {{ action?: unknown }} */ (body).action
    : undefined;
