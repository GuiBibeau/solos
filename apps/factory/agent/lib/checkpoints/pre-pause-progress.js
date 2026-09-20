// @ts-check

/** @typedef {import("./schema.js").StationCheckpoint} StationCheckpoint */

/** @param {import("eve/hooks").HookEvent} event */
const noPriorProgress = (event) => ({
  artifactIds: [],
  diagnostics: ["No completed station operation preceded the session-limit guardrail."],
  latestOperation: {
    at: event.meta.at,
    name: "session-limit guardrail request",
    status: /** @type {const} */ ("passed"),
  },
  nextMilestone:
    "After explicit continuation approval, inspect the preserved checkout before the first station operation.",
  verification: {
    stage: "no-verification-before-guardrail",
    status: /** @type {const} */ ("not_started"),
  },
});

/** @param {import("./runtime-observation.js").RuntimeProgress} progress */
const progressDiagnostics = (progress) =>
  progress.failures.map(
    (failure) => `${failure.name} ${failure.status} (${failure.code}) at ${failure.at}`,
  );

/** @param {import("./schema.js").StationCheckpoint["latestOperation"]} operation */
const nextMilestone = (operation) =>
  operation.status === "passed"
    ? `Continue from completed ${operation.name} on the preserved checkout.`
    : `Correct ${operation.name}, then rerun it on the preserved checkout.`;

/** @param {StationCheckpoint | undefined} previous @param {import("./runtime-observation.js").RuntimeProgress} progress */
const verification = (previous, progress) => {
  const isRuntimeNewer =
    progress.verificationAt !== undefined &&
    (previous === undefined || progress.verificationAt > previous.updatedAt);
  if (isRuntimeNewer && progress.verification !== undefined) return progress.verification;
  return (
    previous?.verification ?? {
      stage: "no-verification-before-guardrail",
      status: /** @type {const} */ ("not_started"),
    }
  );
};

/** @param {StationCheckpoint | undefined} previous @param {import("./runtime-observation.js").RuntimeProgress} progress */
const currentProgress = (previous, progress) => ({
  artifactIds: previous?.artifactIds ?? [],
  diagnostics: [
    ...new Set([...(previous?.diagnostics ?? []), ...progressDiagnostics(progress)]),
  ].slice(-20),
  latestOperation: progress.latestOperation,
  nextMilestone: nextMilestone(progress.latestOperation),
  verification: verification(previous, progress),
});

/** @param {StationCheckpoint} previous */
const priorProgress = (previous) => ({
  artifactIds: previous.artifactIds,
  diagnostics: previous.diagnostics,
  latestOperation: previous.latestOperation,
  nextMilestone: previous.nextMilestone,
  verification: previous.verification,
});

/** @param {StationCheckpoint | undefined} previous @param {import("eve/hooks").HookEvent} event @param {import("./runtime-observation.js").RuntimeObservation | undefined} observation */
export const prePauseProgress = (previous, event, observation) => {
  const runtime = observation?.progress;
  if (
    runtime !== undefined &&
    (previous === undefined || runtime.latestOperation.at > previous.updatedAt)
  )
    return currentProgress(previous, runtime);
  if (previous === undefined) return noPriorProgress(event);
  return priorProgress(previous);
};
