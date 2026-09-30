// @ts-check
export { connectMcp, solosServerCommand, stdioTransport } from "./client/index.js";
export {
  makePreflightTelemetry,
  makeToolLayer,
  makeToolRuntime,
} from "./runtime.js";
export { SERVER_NAME, createSolosServer } from "./server/create-server.js";
export { BOOTSTRAP_TOOLS, SEARCH_TOOL } from "./server/discovery.js";
export { buildInstructions } from "./server/instructions.js";
export { filterByTier } from "./server/register-tools.js";
export { errorResult, resultFromExit, successResult, thrownResult } from "./server/tool-result.js";
