// @ts-check
import { createHash } from "node:crypto";
import { STATION_CHECKPOINTS_PREFIX, STATION_OBSERVATIONS_PREFIX } from "../blob.js";
import { FACTORY_REPO } from "../constants.js";
import { StationSchema } from "./schema.js";

const WORK_ITEM = /^[a-zA-Z0-9._:/#-]{1,200}$/;
const RUN_ID = /^[a-zA-Z0-9._:/#-]{1,200}$/;

/** @param {string} workItem @param {string} rootRunId @param {string} station */
export const checkpointKey = (workItem, rootRunId, station) => {
  if (
    !WORK_ITEM.test(workItem) ||
    workItem.includes("..") ||
    !RUN_ID.test(rootRunId) ||
    rootRunId.includes("..") ||
    !StationSchema.safeParse(station).success
  )
    return null;
  const repository = createHash("sha256").update(FACTORY_REPO).digest("hex").slice(0, 24);
  const item = createHash("sha256").update(workItem).digest("hex").slice(0, 24);
  const root = createHash("sha256").update(rootRunId).digest("hex").slice(0, 24);
  return `${STATION_CHECKPOINTS_PREFIX}${repository}/${item}/${root}/${station}.json`;
};

/** @param {string} stationRunId */
export const observationKey = (stationRunId) => {
  if (!RUN_ID.test(stationRunId) || stationRunId.includes("..")) return null;
  const repository = createHash("sha256").update(FACTORY_REPO).digest("hex").slice(0, 24);
  const run = createHash("sha256").update(stationRunId).digest("hex").slice(0, 32);
  return `${STATION_OBSERVATIONS_PREFIX}${repository}/${run}.json`;
};

/** @param {string} stationRunId @param {string} turnId */
export const taskBindingKey = (stationRunId, turnId) => {
  const observation = observationKey(stationRunId);
  if (observation === null || !RUN_ID.test(turnId) || turnId.includes("..")) return null;
  const turn = createHash("sha256").update(turnId).digest("hex").slice(0, 24);
  return observation.replace(/\.json$/, `/turns/${turn}/task.json`);
};

/** @param {string} workItem @param {string} rootRunId @param {string} station */
export const currentTaskKey = (workItem, rootRunId, station) => {
  const checkpoint = checkpointKey(workItem, rootRunId, station);
  return checkpoint?.replace(/\.json$/, "/current-task.json") ?? null;
};
