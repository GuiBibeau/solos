/**
@type {import('dependency-cruiser').IConfiguration}
*/
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "core-has-no-io-deps",
      comment: "core is pure: no Kit, MCP SDK, AI SDK, or Bun-specific modules",
      severity: "error",
      from: { path: "^packages/core/src" },
      // Externals resolve to their bare specifier from core (not a dependency there), so match both forms.
      to: {
        path: "(^|node_modules/)(@solana/|@solana-program/|@modelcontextprotocol/|@ai-sdk/|ai/|ai$)|^bun:",
      },
    },
    {
      name: "domain-imports-only-domain-and-shared",
      severity: "error",
      from: { path: "^packages/core/src/(?!shared)[^/]+/domain/" },
      to: { path: "^packages/core/src/(?!shared)[^/]+/(ports|use-cases|tools)/" },
    },
    {
      name: "ports-do-not-import-use-cases-or-tools",
      severity: "error",
      from: { path: "^packages/core/src/(?!shared)[^/]+/ports/" },
      to: { path: "^packages/core/src/(?!shared)[^/]+/(use-cases|tools)/" },
    },
    {
      name: "no-cross-slice-internals",
      comment: "a slice may only import another slice through its index.js",
      severity: "error",
      from: { path: "^packages/core/src/(?!shared)([^/]+)/" },
      to: {
        path: "^packages/core/src/(?!shared)([^/]+)/(domain|ports|use-cases|tools)/",
        pathNot: "^packages/core/src/$1/",
      },
    },
    {
      name: "shared-does-not-import-slices",
      severity: "error",
      from: { path: "^packages/core/src/shared/" },
      to: { path: "^packages/core/src/(?!shared)[^/]+/" },
    },
    {
      name: "actions-is-a-leaf",
      comment: "the published contract package depends on nothing else in the monorepo",
      severity: "error",
      from: { path: "^packages/actions/src" },
      to: { path: "^(packages|apps)/(?!actions/)" },
    },
    {
      name: "only-cli-and-harness-import-mcp",
      severity: "error",
      from: { path: "^packages/(core|solana)/src" },
      to: { path: "^packages/mcp/src" },
    },
    {
      name: "nothing-imports-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: { orphan: true, pathNot: [String.raw`\.test\.js$`, "^scripts/", String.raw`\.d\.ts$`] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // node_modules stay in the graph as leaves so external-dependency rules can match them.
    exclude: { path: String.raw`\.test\.js$` },
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "default", "bun"],
      extensions: [".js"],
    },
    reporterOptions: { dot: { collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)" } },
  },
};
