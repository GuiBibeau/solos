#!/usr/bin/env bun
// @ts-check
/**
 * stdio entry point. Spawned by MCP clients (Claude Code, Codex, Cursor, the solos CLI).
 * stdout carries JSON-RPC only; every log line goes to stderr as JSON.
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { allTools, errorEnvelope } from "@solos/core";
import { loadSolanaEnv, rpcOrigin } from "@solos/solana";
import { z } from "zod";
import { makePreflightTelemetry, makeToolRuntime } from "../runtime.js";
import { createSolosServer } from "../server/create-server.js";

const VERSION = "0.0.0";
const TierSchema = z.enum(["read", "simulate", "execute"]).default("simulate");

/**
 * `--tier <read|simulate|execute>` on the server command line. An explicit flag beats the
 * inherited `SOLOS_TOOL_TIER` env var, which stays supported for callers that already set it.
 * A `--tier` with no value (or another flag after it) is malformed and must fail startup rather
 * than fall back to a possibly more permissive environment value.
 * @param {ReadonlyArray<string>} argv
 */
const tierFlag = (argv) => {
  const index = argv.indexOf("--tier");
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? "" : value;
};

const main = async () => {
  const env = loadSolanaEnv(process.env);
  const runtime = makeToolRuntime(env, { logLevel: process.env.SOLOS_LOG_LEVEL });
  const telemetry = makePreflightTelemetry({ logLevel: process.env.SOLOS_LOG_LEVEL });
  const server = createSolosServer({
    tools: allTools,
    runtime,
    telemetry,
    version: VERSION,
    tierCeiling: TierSchema.parse(tierFlag(process.argv) ?? process.env.SOLOS_TOOL_TIER),
  });
  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await runtime.dispose();
    await telemetry.dispose();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
  // Credentials can sit in an authenticated endpoint's path or query: the startup line, like
  // every token-read error, carries the origin only.
  console.error(
    JSON.stringify({
      message: "solos mcp ready",
      rpcUrl: rpcOrigin(env.rpcUrl),
      tools: allTools.length,
    }),
  );
};

main().catch((error) => {
  const message =
    error instanceof z.ZodError
      ? z.prettifyError(error)
      : (errorEnvelope(error)?.reason ?? String(error));
  console.error(
    JSON.stringify({ level: "ERROR", message: "solos mcp failed to start", cause: message }),
  );
  process.exit(1);
});
