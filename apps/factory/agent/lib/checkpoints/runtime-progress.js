// @ts-check
import { z } from "zod";
import { artifactIds, boundedStepDetail, errorDetail, record } from "./runtime-progress-facts.js";
import { StationCheckpointSchema } from "./schema.js";

const FailureSchema = z.object({
  at: z.iso.datetime(),
  code: z.string().min(1).max(200),
  detail: z.string().min(1).max(500).optional(),
  name: z.string().min(1).max(200),
  status: z.enum(["failed", "cancelled"]),
});

export const RuntimeProgressSchema = z.object({
  artifactIds: z.array(z.string().min(1).max(200)).max(20).default([]),
  failures: z.array(FailureSchema).max(20),
  latestOperation: StationCheckpointSchema.shape.latestOperation.optional(),
  updatedAt: z.iso.datetime().optional(),
  verification: StationCheckpointSchema.shape.verification.optional(),
  verificationAt: z.iso.datetime().optional(),
});

const OPERATION_STATUS = /** @type {const} */ ({
  completed: "passed",
  failed: "failed",
  rejected: "cancelled",
});
const ADMINISTRATIVE_TOOLS = new Set([
  "checkout-branch",
  "read-artifact",
  "read-station-checkpoint",
  "save-artifact",
  "save-station-checkpoint",
]);
const VERIFICATION_TOOLS = new Set(["verify-station"]);
/** @param {Extract<import("eve/hooks").HookEvent, {type: "action.result"}>} event */
const actionProgress = (event) => {
  if (event.data.result.kind !== "tool-result") return undefined;
  const name = event.data.result.toolName.slice(0, 200);
  const output = record(event.data.result.output);
  const artifacts = artifactIds(name, output);
  if (ADMINISTRATIVE_TOOLS.has(name))
    return artifacts.length === 0 ? undefined : { artifactIds: artifacts, at: event.meta.at };
  const isReportedFailure = VERIFICATION_TOOLS.has(name) && output.success === false;
  const status = isReportedFailure
    ? /** @type {const} */ ("failed")
    : OPERATION_STATUS[event.data.status];
  return {
    artifactIds: artifacts,
    at: event.meta.at,
    code: (event.data.error?.code ?? `ACTION_${event.data.status.toUpperCase()}`).slice(0, 200),
    detail: errorDetail(event),
    latestOperation: { at: event.meta.at, name, status },
    verification: VERIFICATION_TOOLS.has(name),
  };
};

/** @param {Extract<import("eve/hooks").HookEvent, {type: "step.failed"}>} event */
const stepProgress = (event) => ({
  artifactIds: [],
  at: event.meta.at,
  code: event.data.code.slice(0, 200),
  detail: boundedStepDetail(event.data.message),
  latestOperation: {
    at: event.meta.at,
    name: `model step ${event.data.stepIndex}`,
    status: /** @type {const} */ ("failed"),
  },
  verification: false,
});

/** @param {import("eve/hooks").HookEvent} event */
export const progressFromEvent = (event) => {
  if (event.type === "action.result") return actionProgress(event);
  if (event.type === "step.failed") return stepProgress(event);
  return undefined;
};

/** @param {import("./runtime-observation.js").RuntimeProgress | undefined} prior */
const priorOperationFields = (prior) => ({
  failures: prior?.failures ?? [],
  latestOperation: prior?.latestOperation,
  verification: prior?.verification,
  verificationAt: prior?.verificationAt,
});

/** @param {import("./runtime-observation.js").RuntimeProgress | undefined} prior @param {NonNullable<ReturnType<typeof progressFromEvent>>} fact */
const operationFields = (prior, fact) => {
  const operation = fact.latestOperation;
  if (operation === undefined) return priorOperationFields(prior);
  const failures = updatedFailures(prior, { ...fact, latestOperation: operation });
  if (!fact.verification)
    return {
      failures,
      latestOperation: operation,
      verification: prior?.verification,
      verificationAt: prior?.verificationAt,
    };
  const status =
    operation.status === "passed"
      ? /** @type {const} */ ("passed")
      : /** @type {const} */ ("failed");
  return {
    failures,
    latestOperation: operation,
    verification: {
      stage: operation.name,
      status,
    },
    verificationAt: operation.at,
  };
};

/** @param {import("./runtime-observation.js").RuntimeProgress | undefined} prior @param {NonNullable<ReturnType<typeof progressFromEvent>> | undefined} fact */
export const mergeRuntimeProgress = (prior, fact) => {
  if (fact === undefined) return prior;
  const fields = operationFields(prior, fact);
  return RuntimeProgressSchema.parse({
    artifactIds: [...new Set([...(prior?.artifactIds ?? []), ...fact.artifactIds])].slice(-20),
    ...fields,
    failures: fields.failures.slice(-20),
    updatedAt: fact.at,
  });
};

/** @param {import("./runtime-observation.js").RuntimeProgress | undefined} prior @param {NonNullable<ReturnType<typeof progressFromEvent>> & {latestOperation: NonNullable<NonNullable<ReturnType<typeof progressFromEvent>>["latestOperation"]>}} fact */
const updatedFailures = (prior, fact) => {
  const operation = fact.latestOperation;
  const failures = (prior?.failures ?? []).filter((failure) => failure.name !== operation.name);
  if (operation.status === "passed") return failures;
  return [
    ...failures,
    {
      at: operation.at,
      code: fact.code,
      ...(fact.detail !== undefined && { detail: fact.detail }),
      name: operation.name,
      status: operation.status,
    },
  ];
};
