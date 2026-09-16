// @ts-check
/**
 * Root agent sandbox: the hosted Vercel Sandbox backend for local development and production
 * alike. The `onSession` hook marks `/workspace` as a safe git directory before the GitHub
 * channel's per-turn checkout runs there (the filesystem is owned by the builder uid, not the
 * session user). The station sandboxes handle the same hazard for `/workspace/repo`.
 */
import { defineSandbox } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";
import { FACTORY_SANDBOX_CREATE_OPTIONS } from "./lib/github/repo-sandbox.js";
import { assertNoSolanaSecrets, runOrThrow } from "./lib/github/sandbox-commands.js";

export default defineSandbox({
  backend: vercel(FACTORY_SANDBOX_CREATE_OPTIONS),
  async onSession({ use }) {
    const sandbox = await use();
    await assertNoSolanaSecrets(sandbox);
    await runOrThrow(sandbox, "git config --global --add safe.directory /workspace");
  },
});
