// @ts-check
import { ActionExecutor } from "@solos/core";
import { rpcOrigin } from "@solos/solana";
import { handleRequest } from "./routes.js";

/**
 * Bind the HTTP server and print the one startup line. `url` is included so a port of 0 is
 * discoverable; the required fields are signer, tier, rpc host, data directory and mode.
 * @param {{
 *   runtime: import("effect").ManagedRuntime.ManagedRuntime<any, any>;
 *   db: import("bun:sqlite").Database;
 *   signer: string;
 *   rpcUrl: string;
 *   host: string;
 *   port: number;
 *   tier: import("./config.js").Tier;
 *   mode: import("./config.js").Mode;
 *   token: string;
 *   dataDir: string;
 *   strategyHandle?: import("./http.js").EngineDeps["strategyHandle"];
 * }} input
 */
export const serveEngine = async (input) => {
  const executor = await input.runtime.runPromise(ActionExecutor);
  const startedAt = Date.now();
  const server = Bun.serve({
    hostname: input.host,
    port: input.port,
    fetch: (request) =>
      handleRequest(request, {
        token: input.token,
        tier: input.tier,
        mode: input.mode,
        signer: input.signer,
        rpcHost: rpcOrigin(input.rpcUrl),
        startedAt,
        db: input.db,
        runtime: input.runtime,
        executor,
        caps: input.strategyHandle !== undefined,
        ...(input.strategyHandle !== undefined && { strategyHandle: input.strategyHandle }),
      }),
  });
  const url = `http://${input.host}:${server.port}`;
  writeReady(input, url);
  return {
    url,
    signer: input.signer,
    stop: async () => {
      server.stop(true);
      input.db.close();
      await input.runtime.dispose();
    },
  };
};

/**
 * @param {{ signer: string; tier: string; rpcUrl: string; dataDir: string; mode: string }} input
 * @param {string} url
 */
const writeReady = (input, url) => {
  process.stderr.write(
    `${JSON.stringify({
      message: "solos engine ready",
      signer: input.signer,
      tier: input.tier,
      rpcHost: rpcOrigin(input.rpcUrl),
      dataDir: input.dataDir,
      mode: input.mode,
      url,
    })}\n`,
  );
};
