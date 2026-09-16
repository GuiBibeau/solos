#!/usr/bin/env bun
// @ts-check
/** Daemon entry: `bun run apps/harness/src/main.js` or `solos daemon`. */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadHarness, makeHarnessRuntime } from "./composition.js";
import { runDaemon } from "./daemon/daemon.js";

const main = async () => {
  const { layer, config } = await loadHarness();
  mkdirSync(path.dirname(config.daemon.storePath), { recursive: true });
  const runtime = makeHarnessRuntime(layer);
  const shutdown = async () => {
    await runtime.dispose();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await runtime.runPromise(runDaemon());
};

main().catch((error) => {
  console.error(
    JSON.stringify({ level: "ERROR", message: "solos daemon failed", cause: String(error) }),
  );
  process.exit(1);
});
