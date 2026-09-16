// @ts-check
export { connectMcp, solosServerCommand } from "./client/index.js";
export { makeToolLayer, makeToolRuntime } from "./runtime.js";
export { SERVER_NAME, createSolosServer } from "./server/create-server.js";
export { buildInstructions } from "./server/instructions.js";
export { filterByTier } from "./server/register-tools.js";
export { errorResult, resultFromExit, successResult } from "./server/tool-result.js";
