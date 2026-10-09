#!/usr/bin/env bun
// @ts-check
/**
 * stdio entry point for a checkout: spawned by MCP clients (Claude Code, Codex, Cursor) and by
 * `solos mcp ...` as `bun --no-env-file <this file>`. An installed solos serves the same thing
 * through `solos mcp serve` (ADR-0035). stdout carries JSON-RPC only; every log line goes to
 * stderr as JSON.
 */
import { describeStartupFailure, serveStdio } from "../server/serve-stdio.js";

/**
 * One `--flag <value>` on the server command line. An explicit flag beats the inherited env
 * var. A flag with no value (or another flag after it) is malformed and must fail startup
 * rather than fall back to a possibly more permissive environment value.
 * @param {ReadonlyArray<string>} argv
 * @param {string} flag
 */
const flagValue = (argv, flag) => {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? "" : value;
};

serveStdio({
  tier: flagValue(process.argv, "--tier"),
  tools: flagValue(process.argv, "--tools"),
  features: flagValue(process.argv, "--features"),
}).catch((error) => {
  console.error(
    JSON.stringify({
      level: "ERROR",
      message: "solos mcp failed to start",
      cause: describeStartupFailure(error),
    }),
  );
  process.exit(1);
});
