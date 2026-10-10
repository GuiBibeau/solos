// @ts-check
import {
  EventBusInMemory,
  EventSinkNoop,
  LoggerJsonStderr,
  StoreInMemory,
  ToolCatalogue,
  allTools,
  catalogueOf,
} from "@solos/core";
import { SolanaLive, loadSolanaEnv } from "@solos/solana";
import { Layer, ManagedRuntime } from "effect";
import { loadHarnessConfig, loadHarnessEnv } from "./config.js";
import { TracingLive } from "./observability/tracing.js";
import { RouterLive } from "./router/router.js";

const DEFAULT_CONFIG_PATH = "harness.config.js";
/** Experimental tools are withheld unless the Operator enables them. */
const NO_FEATURES = Object.freeze({ experimental: false });

/**
 * The harness composition root. Reads env and config, returns the full Layer plus the parsed
 * inputs so every entry point shares one wiring. `toolCeiling` is the tier ceiling the surface
 * runs under (ADR-0033); the search tool reads it from the catalogue, so what it reports as
 * available is what the surface actually offers. `Store` is in memory: nothing in the harness
 * persists through it.
 * @param {{
 *   env?: Record<string, string | undefined>;
 *   configPath?: string;
 *   toolCeiling?: import("./agent/tool-ceiling.js").Tier;
 *   features?: { experimental: boolean };
 * }} [options] `features` is what the surface exposes beyond the default (ADR-0036): experimental
 *   tools are withheld unless the Operator enabled them, on this surface as on the MCP server.
 */
export const loadHarness = async (options = {}) => {
  const env = options.env ?? process.env;
  const solanaEnv = loadSolanaEnv(env);
  const harnessEnv = loadHarnessEnv(env);
  const config = await loadHarnessConfig(
    options.configPath ?? env.SOLOS_CONFIG ?? DEFAULT_CONFIG_PATH,
  );
  const layer = Layer.mergeAll(
    SolanaLive(solanaEnv),
    EventBusInMemory,
    EventSinkNoop,
    StoreInMemory,
    RouterLive(harnessEnv.ROUTER_PRESET, config.router),
    Layer.succeed(
      ToolCatalogue,
      catalogueOf(allTools, options.toolCeiling ?? "execute", options.features ?? NO_FEATURES),
    ),
  ).pipe(
    Layer.provideMerge(TracingLive(harnessEnv.OTEL_EXPORTER_OTLP_ENDPOINT, "solos-harness")),
    Layer.provideMerge(LoggerJsonStderr(harnessEnv.SOLOS_LOG_LEVEL)),
  );
  return { layer, config, harnessEnv, solanaEnv };
};

/** @param {Awaited<ReturnType<typeof loadHarness>>["layer"]} layer */
export const makeHarnessRuntime = (layer) => ManagedRuntime.make(layer);
