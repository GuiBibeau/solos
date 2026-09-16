// @ts-check
/**
 * Resolve a `SecretRef`: `$NAME` reads the environment, `!cmd` runs a command and takes its
 * trimmed stdout, anything else is the literal value. Copied from pi's auth.json convention.
 * @param {string} ref
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export const resolveSecretRef = (ref, env) => {
  if (ref.startsWith("$")) {
    const value = env[ref.slice(1)];
    if (value === undefined || value === "")
      throw new Error(`secret ref ${ref}: variable is not set`);
    return value;
  }
  if (ref.startsWith("!")) {
    const proc = Bun.spawnSync(["sh", "-c", ref.slice(1)], { stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) {
      throw new Error(`secret ref ${ref}: command failed (${proc.stderr.toString().trim()})`);
    }
    return proc.stdout.toString().trim();
  }
  return ref;
};

/** True when the value is a reference, not a literal secret. Used to decide what to write to disk. */
/** @param {string} value */
export const isSecretRef = (value) => value.startsWith("$") || value.startsWith("!");
