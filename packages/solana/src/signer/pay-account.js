// @ts-check
/**
 * The `pay` CLI keeps its keys in the OS keychain (or its own file store). We never copy them:
 * each start asks pay to export the account to stdout and keeps the bytes in memory only.
 * pay may prompt for Touch ID when the account has `auth_required`.
 * @param {string} account
 * @returns {Promise<Uint8Array>} 64-byte Solana CLI keypair
 */
export const exportPayAccount = async (account) => {
  const proc = Bun.spawn(["pay", "account", "export", account, "-"], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`pay account export ${account} failed: ${stderr.trim()}`);
  const json = stdout.slice(stdout.indexOf("["), stdout.lastIndexOf("]") + 1);
  const bytes = /** @type {number[]} */ (JSON.parse(json));
  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error(`pay account export ${account}: expected a 64-byte keypair array`);
  }
  return new Uint8Array(bytes);
};
