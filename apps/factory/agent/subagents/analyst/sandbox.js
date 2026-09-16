// @ts-check
/**
 * This station's own checkout of the factory repository. Declared subagents share nothing with
 * the root or each other, so each repo-facing station authors its sandbox from the shared
 * builders in `agent/lib/github/repo-sandbox.js`: the clone and setup run once per template
 * build, and each session pays only a fetch of the current default branch.
 */
import { defineSandbox } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";
import {
  FACTORY_SANDBOX_CREATE_OPTIONS,
  factoryBootstrap,
  factoryOnSession,
  factoryRevalidationKey,
} from "../../lib/github/repo-sandbox.js";

export default defineSandbox({
  backend: vercel(FACTORY_SANDBOX_CREATE_OPTIONS),
  bootstrap: factoryBootstrap,
  onSession: factoryOnSession,
  revalidationKey: factoryRevalidationKey,
});
