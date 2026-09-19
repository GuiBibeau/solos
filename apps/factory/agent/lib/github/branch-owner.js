// @ts-check
const SHA = /^[0-9a-f]{40}$/u;
/** @param {string[]} fields */
const isValidRemoteEntry = (fields) =>
  fields.length === 2 && SHA.test(fields[0] ?? "") && fields[1]?.startsWith("refs/") === true;

/** @param {string} output */
export const parseRemoteHead = (output) => {
  const lines = output.trim() === "" ? [] : output.trim().split("\n");
  if (lines.length === 0) return null;
  const fields = lines[0]?.trim().split(/\s+/u) ?? [];
  return lines.length === 1 && isValidRemoteEntry(fields) ? fields[0] : undefined;
};

/** @typedef {{allowed: true, remoteHead: string | null} | {allowed: false, error: string}} PushAuthorization */

/**
 * Existing branches require the head observed when the station took ownership. A normal push
 * still supplies the atomic non-fast-forward protection; this check prevents an old station from
 * publishing after another owner advanced the branch.
 * @param {{expectedHead?: string, remoteOutput: string}} input
 * @returns {PushAuthorization}
 */
export const authorizeBranchPush = (input) => {
  const remoteHead = parseRemoteHead(input.remoteOutput);
  if (remoteHead === undefined)
    return { allowed: false, error: "Remote branch state was ambiguous; reconcile ownership." };
  if (remoteHead === null)
    return input.expectedHead === undefined
      ? { allowed: true, remoteHead }
      : { allowed: false, error: "Expected an existing branch, but the remote branch is absent." };
  if (input.expectedHead === undefined)
    return { allowed: false, error: "Existing branches require expectedHead from checkout." };
  return remoteHead === input.expectedHead
    ? { allowed: true, remoteHead }
    : {
        allowed: false,
        error: `Remote head changed from ${input.expectedHead} to ${remoteHead}; reconcile the active owner.`,
      };
};
