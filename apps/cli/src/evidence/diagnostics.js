// @ts-check
const MAX_OUTPUT = 65_536;
const OMITTED = "\n[diagnostic output truncated]\n";

/** Redact before truncation so a cut cannot reveal part of a credential. @param {string} text */
export const redactDiagnostics = (text) => {
  const secrets = Object.entries(process.env)
    .filter(([key, value]) => /secret|token|password|key|rpc_url/i.test(key) && value)
    .map(([, value]) => /** @type {string} */ (value))
    .toSorted((a, b) => b.length - a.length);
  let safe = text;
  for (const secret of secrets) safe = safe.replaceAll(secret, "[redacted]");
  // Provider URLs may carry credentials in their path, query, or user-info.
  return safe.replaceAll(/https?:\/\/[^\s"'<>\\]+/g, "[redacted-url]");
};

/** Preserve the beginning (assertion) and end (summary) of a failed step. @param {string} text */
const boundedOutput = (text) => {
  if (text.length <= MAX_OUTPUT) return text;
  const half = Math.floor((MAX_OUTPUT - OMITTED.length) / 2);
  return `${text.slice(0, half)}${OMITTED}${text.slice(-half)}`;
};

/**
 * JSON stdout stays reserved for Evidence. The caller passes already-redacted output.
 * @param {string} step
 * @param {{ code: number; output: string }} failure
 */
export const reportStepFailure = (step, { code, output }) => {
  process.stderr.write(
    `${JSON.stringify({
      event: "verification.step.failed",
      step,
      exitCode: code,
      truncated: output.length > MAX_OUTPUT,
      output: boundedOutput(output),
    })}\n`,
  );
};
