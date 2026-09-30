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
    // Never the parent's stdin: inside a stdio MCP server that stream carries JSON-RPC, and a
    // prompting child would swallow it. Touch ID prompts do not read stdin.
    stdin: "ignore",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`pay account export ${account} failed: ${stderr.trim()}`);
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`pay account export ${account}: no keypair array in the output`);
  }
  const bytes = /** @type {unknown} */ (JSON.parse(stdout.slice(start, end + 1)));
  if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every(Number.isInteger)) {
    throw new Error(`pay account export ${account}: expected a 64-byte keypair array`);
  }
  return new Uint8Array(/** @type {number[]} */ (bytes));
};
