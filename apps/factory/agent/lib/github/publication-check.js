// @ts-check
import { asRecord, stringField } from "./channel-gates.js";
import { REPO_PATH } from "./rebase-api.js";

/** @typedef {import("./rebase-api.js").RebaseApi} Api */

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
