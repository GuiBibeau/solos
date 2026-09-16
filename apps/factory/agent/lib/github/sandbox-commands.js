// @ts-check
/**
 * Small sandbox helpers shared by the station sandbox lifecycle in `repo-sandbox.js`.
 */
import { FACTORY_REPO } from "../constants.js";
import { appAccessMessage, sanitizeCommandOutput } from "./bootstrap-diagnostics.js";
import { FALLBACK_BOT_NAME, resolveBotName } from "./bot-name.js";

/** @typedef {import("eve/sandbox").SandboxSession} SandboxSession */

/**
 * Runs a command and throws on a nonzero exit, so a broken clone or setup fails the template build
 * loudly instead of shipping a half-provisioned snapshot to every session.
 * @param {SandboxSession} sandbox
 * @param {string} command
 */
export const runOrThrow = async (sandbox, command) => {
  const result = await sandbox.run({ command });
  if (result.exitCode !== 0) {
    const detail = String(result.stderr || result.stdout).trim();
    throw new Error(
      sanitizeCommandOutput(
        `Sandbox command failed (exit ${result.exitCode}): ${command}\n${detail}`,
      ),
    );
  }
};

/**
 * The factory never holds a Solana signer, RPC URL, profile, or gateway key, and none may reach
 * a sandbox. This is the structural check behind that rule: the session fails before any command
 * runs if such a variable is present in the sandbox environment.
 * @param {SandboxSession} sandbox
 */
export const assertNoSolanaSecrets = (sandbox) =>
  runOrThrow(
    sandbox,
    "if env | grep -qE '^(SOLOS_|SOLANA_|AI_GATEWAY_API_KEY=)'; then echo 'forbidden SOLOS_*/SOLANA_*/AI_GATEWAY_API_KEY variables are present in the sandbox' >&2; exit 1; fi",
  );

/**
 * Mints the brokered installation token, translating a refusal (typically "App authorization
 * required" from Connect) into the actionable message. The token never appears in either.
 * @param {() => Promise<string>} mint
 */
export const mintTokenOrExplain = async (mint) => {
  try {
    return await mint();
  } catch (error) {
    throw new Error(appAccessMessage(FACTORY_REPO), { cause: error });
  }
};

/** Characters allowed in a bot name interpolated into a shell-quoted git config command. */
const SAFE_BOT_NAME = /^[\w.-]+$/;

/**
 * The bot's commit identity, from the connector-resolved name, falling back to the static default
 * when resolution fails or the name carries characters that don't belong in a shell-quoted value.
 * @returns {Promise<{ email: string; name: string }>}
 */
export const gitIdentity = async () => {
  const resolved = await resolveBotName().catch(() => FALLBACK_BOT_NAME);
  const safe = SAFE_BOT_NAME.test(resolved) ? resolved : FALLBACK_BOT_NAME;
  return { email: `${safe.toLowerCase()}[bot]@users.noreply.github.com`, name: `${safe}[bot]` };
};
