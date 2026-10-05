// @ts-check
/**
 * Non-secret harness settings. Secrets live in the environment only (see .env.example).
 * Every field is validated by `apps/harness/src/config.js` at startup.
 * @type {import("./apps/harness/src/config.js").HarnessConfigInput}
 */
export default {
  router: {
    // Overrides per task class win over the preset selected by ROUTER_PRESET.
    overrides: {},
    crossProviderFallback: true,
  },
  agent: {
    maxSteps: 20,
  },
  mcpServers: [
    // Third-party MCP servers discovered by the harness agent loop, e.g.
    // { name: "surfpool", command: "surfpool", args: ["mcp"] }
  ],
};
