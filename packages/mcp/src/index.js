// @ts-check
export {
  SERVE_ARGS,
  connectMcp,
  serverCommandFor,
  solosServerCommand,
  stdioTransport,
} from "./client/index.js";
export {
  makePreflightTelemetry,
  makeToolLayer,
  makeToolRuntime,
} from "./runtime.js";
export { SERVER_NAME, createSolosServer } from "./server/create-server.js";
export { describeStartupFailure, serveStdio } from "./server/serve-stdio.js";
export { SOLOS_COMMIT, SOLOS_VERSION } from "./server/version.js";
export { BOOTSTRAP_TOOLS, SEARCH_TOOL } from "./server/discovery.js";
export { buildInstructions } from "./server/instructions.js";
export { filterByTier } from "./server/register-tools.js";
export { errorResult, resultFromExit, successResult, thrownResult } from "./server/tool-result.js";
