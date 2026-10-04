// @ts-check
/**
 * Prove a freshly compiled binary works as installed: run it from a neutral directory with a
 * scrubbed environment and an empty config dir, the way a first run happens on another machine.
 */
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SERVE_ARGS } from "@solos/mcp";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";

/** @typedef {{ name: string; ok: boolean; detail: string }} Check */
/** @typedef {{ ok?: boolean; issues?: { code: string }[]; mcpConfig?: any }} DoctorReport */

/**
 * @param {string} binary @param {string[]} args @param {Record<string, string>} env
 */
const run = async (binary, args, env) => {
  const proc = Bun.spawn([binary, ...args], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

/** @param {string} text */
const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * `--version` prints the version the build defined.
 * @param {string} binary @param {string} version
 * @returns {Promise<Check>}
 */
const versionCheck = async (binary, version) => {
  const { stdout, code } = await run(binary, ["--version"], {});
  const isOk = code === 0 && stdout.trim().endsWith(version);
  return { name: "version", ok: isOk, detail: stdout.trim() || `exit ${code}` };
};

/**
 * Both missing pieces, and nothing else.
 * @param {DoctorReport | undefined} report
 */
const hasColdIssues = (report) =>
  report?.ok === false &&
  (report.issues ?? [])
    .map((issue) => issue.code)
    .toSorted((a, b) => a.localeCompare(b))
    .join(",") === "RpcConfigMissing,SignerConfigMissing";

/**
 * The paste-ready config names this binary rather than a checkout path. The binary reports its
 * own `process.execPath`, which is canonical, so compare real paths.
 * @param {DoctorReport | undefined} report @param {string} binary
 */
const namesBinary = (report, binary) => {
  const entry = report?.mcpConfig?.mcpServers?.solos;
  return (
    typeof entry?.command === "string" &&
    realpathSync.native(entry.command) === realpathSync.native(binary) &&
    JSON.stringify(entry.args) === JSON.stringify(SERVE_ARGS)
  );
};

/**
 * `doctor` with nothing configured reports both missing pieces and a config that runs this
 * binary.
 * @param {string} binary @param {string} configDir
 * @returns {Promise<Check>}
 */
const doctorCheck = async (binary, configDir) => {
  const { stdout, code } = await run(binary, ["doctor"], { SOLOS_CONFIG_DIR: configDir });
  const report = /** @type {DoctorReport | undefined} */ (parseJson(stdout));
  const isOk = code === 1 && hasColdIssues(report) && namesBinary(report, binary);
  return {
    name: "doctor",
    ok: isOk,
    detail: isOk ? "two issues, config names the binary" : stdout,
  };
};

/**
 * `mcp list` spawns the binary's own server over stdio and lists its tools: the whole MCP path
 * inside one executable.
 * @param {string} binary @param {string} configDir @param {string} version
 * @returns {Promise<Check>}
 */
const mcpListCheck = async (binary, configDir, version) => {
  const { stdout, code } = await run(binary, ["mcp", "list"], {
    SOLOS_CONFIG_DIR: configDir,
    SOLANA_RPC_URL: "http://127.0.0.1:1",
    SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
    SOLOS_TOOLS: "all",
    SOLOS_LOG_LEVEL: "warn",
  });
  const listed = parseJson(stdout);
  const tools = Array.isArray(listed?.tools) ? listed.tools.length : 0;
  const isOk = code === 0 && tools > 0 && listed?.server?.version === version;
  return { name: "mcp list", ok: isOk, detail: isOk ? `${tools} tools` : stdout.slice(0, 400) };
};

/**
 * @param {string} binary @param {string} version
 * @returns {Promise<{ ok: boolean; checks: Check[] }>}
 */
export const smokeTest = async (binary, version) => {
  const configDir = await mkdtemp(path.join(tmpdir(), "solos-smoke-"));
  try {
    const checks = [
      await versionCheck(binary, version),
      await doctorCheck(binary, configDir),
      await mcpListCheck(binary, configDir, version),
    ];
    return { ok: checks.every((check) => check.ok), checks };
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
};
