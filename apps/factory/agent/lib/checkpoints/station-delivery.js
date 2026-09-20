// @ts-check

const TASK_ID = /^task_[a-f\d]{24}$/;
const ID = /^[a-zA-Z0-9._:/#-]{1,200}$/;
const DELIVERY =
  /^\[solos-station:(task_[a-f\d]{24})\|([a-z]+)\|([a-zA-Z0-9._:/#-]{1,200})\|([a-zA-Z0-9._:/#-]{1,200})\](?:\n|$)/;
const STATIONS = new Set(["analyst", "classifier", "implementer", "researcher", "reviewer"]);

/** @param {{rootRunId: string; station: string; taskId: string; workItem: string}} identity @param {string} message */
export const stationDeliveryMessage = (identity, message) => {
  const { taskId, station, rootRunId, workItem } = identity;
  if (
    !TASK_ID.test(taskId) ||
    !STATIONS.has(station) ||
    !ID.test(rootRunId) ||
    rootRunId.includes("..") ||
    !ID.test(workItem) ||
    workItem.includes("..")
  )
    throw new Error("Invalid station delivery identity.");
  return `[solos-station:${taskId}|${station}|${rootRunId}|${workItem}]\n${message}`;
};

/** @param {string} message */
export const stationDeliveryFromMessage = (message) => {
  const match = DELIVERY.exec(message);
  if (match === null) return null;
  return {
    rootRunId: match[3],
    station: match[2],
    taskId: match[1],
    workItem: match[4],
  };
};
