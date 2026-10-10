// @ts-check
import { IntentInFlight, IntentNotFound, toJsonSafe } from "@solos/core";
import { signedIntentNote } from "@solos/solana";
import { ActionSchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { z } from "zod";
import { errorResponse, envelopeOf, invalid, json, readJson, statusFor } from "./http.js";
import { claimIntent, failIntent, readIntent, recordSigned, settleIntent } from "./intents.js";
import { observed } from "./observe.js";
import { reconcileIntent } from "./recover.js";
import { tierRefusal } from "./tier.js";

const ExecuteSchema = z.object({
  action: ActionSchema,
  intentId: z.string().min(1).max(256).optional(),
  skipSimulation: z.boolean().optional(),
});

/**
 * @param {Request} request
 * @param {import("./http.js").EngineDeps} deps
 */
export const executeRequest = async (request, deps) => {
  const body = await readJson(request);
  if (!body.ok) return errorResponse(body.error);
  const parsed = ExecuteSchema.safeParse(body.value);
  if (!parsed.success)
    return errorResponse(invalid("action", "execute body did not match the schema"));
  const refusal = tierRefusal(deps.tier, "execute");
  if (refusal !== undefined) return errorResponse(refusal);
  return runExecute(deps, parsed.data);
};

/**
 * @param {import("./http.js").EngineDeps} deps
 * @param {z.infer<typeof ExecuteSchema>} body
 */
const runExecute = async (deps, body) => {
  const intentId = body.intentId ?? crypto.randomUUID();
  const claim = claimIntent(deps.db, intentId, {
    action: body.action,
    simulated: body.skipSimulation !== true,
  });
  if (claim.state === "claimed") return perform(deps, body, intentId);
  const current = claim.state === "in_flight" ? await reconcileIntent(deps, intentId) : claim;
  return replay(current) ?? errorResponse(notFound(intentId));
};

/**
 * @param {ReturnType<typeof claimIntent> | Awaited<ReturnType<typeof reconcileIntent>>} claim
 */
const replay = (claim) => {
  if (claim.state === "claimed") return undefined;
  if (claim.state === "in_flight") return errorResponse(inFlight(claim.intentId));
  if (claim.state === "settled") return json(200, claim.result);
  if (claim.state === "failed")
    return json(statusFor(String(claim.error?.code)), { error: claim.error });
  return undefined;
};

/**
 * @param {import("./http.js").EngineDeps} deps
 * @param {z.infer<typeof ExecuteSchema>} body
 * @param {string} intentId
 */
const perform = async (deps, body, intentId) => {
  try {
    const result = await deps.runtime.runPromise(tracked(deps, body, intentId));
    const safe = toJsonSafe(result);
    settleIntent(deps.db, intentId, safe);
    return json(200, safe);
  } catch (error) {
    return finishFailure(deps, intentId, error);
  }
};

/**
 * @param {import("./http.js").EngineDeps} deps
 * @param {z.infer<typeof ExecuteSchema>} body
 * @param {string} intentId
 */
const tracked = (deps, body, intentId) =>
  observed(
    deps.executor.execute(body.action, { skipSimulation: body.skipSimulation === true }),
    "execute",
  ).pipe(
    Effect.locally(signedIntentNote, (sealed) => {
      recordSigned(deps.db, intentId, sealed);
    }),
  );

/**
 * A signature on the row means the bytes may have been broadcast. Reconcile instead of failing.
 * @param {import("./http.js").EngineDeps} deps
 * @param {string} intentId
 * @param {unknown} error
 */
const finishFailure = async (deps, intentId, error) => {
  const row = readIntent(deps.db, intentId);
  if (row.state === "in_flight" && row.signature !== null) {
    return replay(await reconcileIntent(deps, intentId)) ?? errorResponse(inFlight(intentId));
  }
  const envelope = envelopeOf(error);
  failIntent(deps.db, intentId, envelope);
  return json(statusFor(String(envelope.code)), { error: envelope });
};

/** @param {string} intentId */
const inFlight = (intentId) =>
  new IntentInFlight({
    intentId,
    reason: `intent ${intentId} is already in flight`,
    remedy: `wait and read GET /v1/intents/${intentId}`,
  });

/** @param {string} intentId */
const notFound = (intentId) =>
  new IntentNotFound({
    intentId,
    reason: `no intent ${intentId}`,
    remedy: "check the intentId",
  });
