// @ts-check
/**
 * The MCP server over stdio, as one function both entry points share: the `solos-mcp` bin a
 * checkout runs with `bun`, and `solos mcp serve` inside the compiled binary (ADR-0035). stdout
 * carries JSON-RPC only; the ready line and every log go to stderr as JSON.
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { allTools, catalogueOf, errorEnvelope } from "@solos/core";
import { loadSolanaEnv, rpcOrigin } from "@solos/solana";
import { z } from "zod";
import { makePreflightTelemetry, makeToolRuntime } from "../runtime.js";
import { createSolosServer } from "./create-server.js";
import { SOLOS_VERSION } from "./version.js";

export const TierSchema = z.enum(["read", "simulate", "execute"]).default("simulate");
/** `discover` withholds tools until searched for (ADR-0029); `all` advertises them up front. */
export const ToolsSchema = z.enum(["discover", "all"]).default("discover");

/** @typedef {ReturnType<typeof loadSolanaEnv>} SolanaEnv */
/** @typedef {z.infer<typeof TierSchema>} Tier */
/** @typedef {z.infer<typeof ToolsSchema>} Tools */

/**
 * An env var left blank, as a copied `.env.example` leaves it, means unset: the documented
 * default applies.
 * @param {string | undefined} value
 */
const envValue = (value) => (value === "" ? undefined : value);

/**
 * @param {{ solanaEnv: SolanaEnv; tierCeiling: Tier; discovery: Tools; logLevel: string | undefined }} input
 */
const buildServer = ({ solanaEnv, tierCeiling, discovery, logLevel }) => {
  const runtime = makeToolRuntime(solanaEnv, {
    logLevel,
    catalogue: catalogueOf(allTools, tierCeiling),
  });
  const telemetry = makePreflightTelemetry({ logLevel });
  const server = createSolosServer({
    tools: allTools,
    runtime,
    telemetry,
    version: SOLOS_VERSION,
    tierCeiling,
    discovery: discovery === "discover",
  });
  const dispose = async () => {
    await runtime.dispose();
    await telemetry.dispose();
  };
  return { server, dispose };
};

/**
 * SIGINT and SIGTERM close the server and exit 0. Returns the function that unbinds both.
 * @param {ReturnType<typeof createSolosServer>} server
 * @param {() => Promise<void>} dispose
 */
const bindSignals = (server, dispose) => {
  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await dispose();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  };
};

/**
 * Credentials can sit in an authenticated endpoint's path or query: the startup line, like every
 * token-read error, carries the origin only.
 * @param {SolanaEnv} solanaEnv @param {Tier} tier @param {Tools} discovery
 */
const readyLine = (solanaEnv, tier, discovery) =>
  JSON.stringify({
    message: "solos mcp ready",
    version: SOLOS_VERSION,
    rpcUrl: rpcOrigin(solanaEnv.rpcUrl),
    tools: allTools.length,
    tier,
    discovery,
  });

/**
 * @typedef {{
 *   tier?: string | undefined;
 *   tools?: string | undefined;
 *   env?: NodeJS.ProcessEnv;
 * }} ServeOptions An explicit value (a flag) beats the inherited env var, which stays supported
 *   for callers that already set it; `undefined` falls back to the env var, then the default.
 */

/**
 * Serve until the client closes the transport, then dispose the runtime and resolve. Startup
 * errors (no RPC URL or signer, a bad flag value) reject before anything is advertised.
 * @param {ServeOptions} [options]
 */
export const serveStdio = async ({ tier, tools, env = process.env } = {}) => {
  const solanaEnv = loadSolanaEnv(env);
  const tierCeiling = TierSchema.parse(tier ?? envValue(env.SOLOS_TOOL_TIER));
  const discovery = ToolsSchema.parse(tools ?? envValue(env.SOLOS_TOOLS));
  const { server, dispose } = buildServer({
    solanaEnv,
    tierCeiling,
    discovery,
    logLevel: env.SOLOS_LOG_LEVEL,
  });
  const closed = new Promise((resolve) => {
    // The SDK's Protocol exposes a callback property, not an EventTarget.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    server.server.onclose = () => resolve(undefined);
  });
  const unbind = bindSignals(server, dispose);
  await server.connect(new StdioServerTransport());
  console.error(readyLine(solanaEnv, tierCeiling, discovery));
  await closed;
  unbind();
  await dispose();
};

/**
 * One sentence for the stderr failure line: a flag value Zod refused, a domain error's reason,
 * or the error's text.
 * @param {unknown} error
 */
export const describeStartupFailure = (error) =>
  error instanceof z.ZodError
    ? z.prettifyError(error)
    : (errorEnvelope(error)?.reason ?? String(error));
