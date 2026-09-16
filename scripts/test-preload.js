// @ts-check
/**
 * Runs once before any test file (see bunfig.toml). Lifecycle hooks declared here apply to
 * the whole run. Integration tests start Surfpool lazily through `ensureSurfnet()`; this
 * file guarantees it is stopped afterwards, even on Ctrl-C.
 */
import { afterAll } from "bun:test";

/** @typedef {{ stop: () => Promise<void>; kill: () => void }} Stoppable */
const started = /** @type {Set<Stoppable>} */ (new Set());

/** @type {{ __solosRegisterStopper?: (handle: Stoppable) => void }} */ (
  globalThis
).__solosRegisterStopper = (handle) => {
  started.add(handle);
};

afterAll(async () => {
  await Promise.allSettled([...started].map((h) => h.stop()));
  started.clear();
});

const killAll = () => {
  for (const handle of started) handle.kill();
  started.clear();
};
process.on("exit", killAll);
for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.once(signal, () => {
    killAll();
    process.exit(130);
  });
}
