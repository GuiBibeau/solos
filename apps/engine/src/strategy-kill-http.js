// @ts-check
import { CapLedger } from "@solos/core";
import { Effect } from "effect";
import { z } from "zod";
import { errorResponse, invalid, json, readJson } from "./http.js";

const EngageSchema = z.object({
  scope: z.string().min(1),
  reason: z.string().min(1),
});

const ScopeSchema = z.object({ scope: z.string().min(1) });

/**
 * @param {Request} request
 * @param {import("./http.js").EngineDeps} deps
 * @param {string} pathname
 */
export const handleKill = (request, deps, pathname) => {
  const found = matchKill(request.method, pathname);
  if (found === undefined) return Promise.resolve(errorResponse(unknown(pathname)));
  return found(request, deps);
};

/** @param {string} method @param {string} pathname */
const matchKill = (method, pathname) => {
  if (method === "POST" && pathname === "/v1/strategies/kill") return engage;
  if (method === "POST" && pathname === "/v1/strategies/kill/disengage") return disengage;
  if (method === "GET" && pathname === "/v1/strategies/kill") return status;
  return undefined;
};

/** @param {string} pathname */
const unknown = (pathname) => invalid("path", `no strategy route ${pathname}`);

/**
 * @param {import("./http.js").EngineDeps} deps
 * @param {import("effect").Effect.Effect<unknown, unknown, import("@solos/core/strategy").CapLedgerShape>} effect
 */
const run = (deps, effect) =>
  deps.runtime
    .runPromise(effect)
    .then((value) => json(200, value))
    .catch((error) => errorResponse(error));

/** @param {Request} request @param {import("./http.js").EngineDeps} deps */
const engage = async (request, deps) => {
  const parsed = await body(request, EngageSchema, "scope and reason are required");
  if (parsed.ok === false) return parsed.response;
  const { scope, reason } = parsed.value;
  return run(
    deps,
    Effect.flatMap(CapLedger, (ledger) =>
      ledger.engage({ scope, reason }).pipe(Effect.as({ scope, engaged: true, reason })),
    ),
  );
};

/** @param {Request} request @param {import("./http.js").EngineDeps} deps */
const disengage = async (request, deps) => {
  const parsed = await body(request, ScopeSchema, "scope is required");
  if (parsed.ok === false) return parsed.response;
  const { scope } = parsed.value;
  return run(
    deps,
    Effect.flatMap(CapLedger, (ledger) =>
      ledger.disengage(scope).pipe(Effect.as({ scope, engaged: false, reason: null })),
    ),
  );
};

/** @param {Request} request @param {import("./http.js").EngineDeps} deps */
const status = (request, deps) => {
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  if (scope.length === 0)
    return Promise.resolve(errorResponse(invalid("scope", "scope is required")));
  return run(
    deps,
    Effect.flatMap(CapLedger, (ledger) =>
      ledger.status(scope).pipe(Effect.map((row) => ({ scope, ...row }))),
    ),
  );
};

/**
 * @template T
 * @param {Request} request
 * @param {import("zod").ZodType<T>} schema
 * @param {string} reason
 * @returns {Promise<{ ok: true; value: T } | { ok: false; response: Response }>}
 */
const body = async (request, schema, reason) => {
  const parsed = await readJson(request);
  if (!parsed.ok) return { ok: false, response: errorResponse(parsed.error) };
  const value = schema.safeParse(parsed.value);
  if (!value.success) return { ok: false, response: errorResponse(invalid("scope", reason)) };
  return { ok: true, value: value.data };
};
