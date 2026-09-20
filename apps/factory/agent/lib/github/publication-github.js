// @ts-check
import { asRecord, stringField } from "./channel-gates.js";
import { REPO_PATH, rebaseList } from "./rebase-api.js";

/** @typedef {import("./rebase-api.js").RebaseApi} Api */

/** @param {Api} api @param {number} pullNumber */
export const readPublicationPull = async (api, pullNumber) => {
  const value = asRecord(await api(`${REPO_PATH}/pulls/${pullNumber}`));
  return parsePublicationPull(value);
};

/** @param {Record<string, unknown> | null} value */
const parsePublicationPull = (value) => {
  if (!value) throw new Error("GitHub returned an invalid pull request for Evidence publication");
  if (typeof value.body !== "string")
    throw new Error("GitHub returned an invalid pull request for Evidence publication");
  const { branch, sha } = parsePublicationHead(asRecord(value.head));
  return {
    body: value.body,
    branch,
    head: sha,
    state: stringField(value, "state") ?? "",
    updatedAt: stringField(value, "updated_at") ?? "",
  };
};

/** @param {Record<string, unknown> | null} head */
const parsePublicationHead = (head) => {
  if (!head) throw new Error("GitHub returned an invalid pull request for Evidence publication");
  const sha = stringField(head, "sha");
  if (!sha) throw new Error("GitHub returned an invalid pull request for Evidence publication");
  if (!/^[a-f\d]{40}$/u.test(sha))
    throw new Error("GitHub returned an invalid pull request for Evidence publication");
  const branch = stringField(head, "ref");
  if (!branch) throw new Error("GitHub returned an invalid pull request for Evidence publication");
  return { branch, sha };
};

/** @param {Api} api @param {number} pullNumber */
export const readPublicationComments = (api, pullNumber) =>
  rebaseList(api, `${REPO_PATH}/issues/${pullNumber}/comments`);

/** @param {Api} api @param {number} pullNumber */
export const readPublicationTimeline = (api, pullNumber) =>
  rebaseList(api, `${REPO_PATH}/issues/${pullNumber}/timeline`);

/** @param {Api} api */
export const readRepositoryEvents = (api) => rebaseList(api, `${REPO_PATH}/events`);

/** Find the event that put this exact commit at the branch head.
 * @param {unknown[]} events @param {string} targetSha @param {string} branch
 */
export const remoteHeadChangedAt = (events, targetSha, branch) => {
  const pushes = events.flatMap((entry) => targetPushDate(entry, targetSha, branch));
  if (pushes.length > 0) return pushes.at(-1);
  return timelineHeadChangedAt(events, targetSha) ?? committedAt(events, targetSha);
};

/** @param {unknown} entry @param {string} targetSha @param {string} branch */
const targetPushDate = (entry, targetSha, branch) => {
  const event = asRecord(entry);
  if (event?.type !== "PushEvent") return [];
  const payload = asRecord(event.payload);
  if (payload?.ref !== `refs/heads/${branch}`) return [];
  if (!hasTargetSha(payload, targetSha)) return [];
  const date = stringField(event, "created_at");
  if (!date) return [];
  return Number.isFinite(Date.parse(date)) ? [date] : [];
};

/** @param {Record<string, unknown> | null} payload @param {string} targetSha */
const hasTargetSha = (payload, targetSha) =>
  payload?.head === targetSha || payload?.after === targetSha;

/** @param {unknown[]} events @param {string} targetSha */
const timelineHeadChangedAt = (events, targetSha) =>
  events
    .flatMap((entry) => {
      const event = asRecord(entry);
      const after = asRecord(event?.after_commit);
      const sha = stringField(event, "after_commit_id") ?? stringField(after, "sha");
      const date = stringField(event, "created_at");
      if (!date) return [];
      return sha === targetSha ? [date] : [];
    })
    .at(-1);

/** A commit timestamp is conservative: it can shorten, never extend, the post-push deadline.
 * @param {unknown[]} events @param {string} targetSha
 */
const committedAt = (events, targetSha) =>
  events
    .flatMap((entry) => {
      const event = asRecord(entry);
      const committer = asRecord(event?.committer);
      const date = stringField(committer, "date");
      if (!date) return [];
      return event?.event === "committed" && event.sha === targetSha ? [date] : [];
    })
    .at(-1);

/** @param {Api} api @param {number} pullNumber @param {string} body */
export const writePublicationBody = (api, pullNumber, body) =>
  api(`${REPO_PATH}/pulls/${pullNumber}`, { method: "PATCH", body: { body } });

/** @param {Api} api @param {number} pullNumber @param {string} body */
export const createPublicationComment = async (api, pullNumber, body) => {
  const value = asRecord(
    await api(`${REPO_PATH}/issues/${pullNumber}/comments`, { method: "POST", body: { body } }),
  );
  if (typeof value?.id !== "number")
    throw new Error("GitHub did not return a publication comment id");
  return value.id;
};

/** @param {Api} api @param {number} commentId @param {string} body */
export const writePublicationComment = (api, commentId, body) =>
  api(`${REPO_PATH}/issues/comments/${commentId}`, { method: "PATCH", body: { body } });

/** @param {Api} api @param {string} sha */
export const readEvidenceCheck = async (api, sha) => {
  const value = asRecord(
    await api(
      `${REPO_PATH}/commits/${sha}/check-runs?check_name=evidence&filter=latest&per_page=20`,
    ),
  );
  const runs = Array.isArray(value?.check_runs) ? value.check_runs : [];
  const parsed = runs.flatMap((entry) => {
    const run = asRecord(entry);
    const startedAt = stringField(run, "started_at") ?? "";
    return stringField(run, "name") === "evidence"
      ? [
          {
            status: stringField(run, "status") ?? "",
            conclusion: stringField(run, "conclusion") ?? "",
            startedAt,
            completedAt: stringField(run, "completed_at") ?? "",
          },
        ]
      : [];
  });
  return parsed.toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
};
