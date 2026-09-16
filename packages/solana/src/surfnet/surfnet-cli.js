// @ts-check
/**
 * Surfpool as a child process. The `Surfnet` port (surfnet.js) wraps this for Effect users;
 * tests and the CLI use these plain async functions directly.
 */
import { getBase16Decoder, none } from "@solana/kit";
import { getMintEncoder } from "@solana-program/token";

const HEALTH_TIMEOUT_MS = 20_000;
const KILL_GRACE_MS = 1000;

/** Ask the OS for a free port, then release it. */
const freePort = () => {
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const { port } = listener;
  listener.stop(true);
  return port;
};

/**
 * @param {string} url
 * @param {string} method
 * @param {unknown[]} params
 * @returns {Promise<any>}
 */
export const jsonRpc = async (url, method, params = []) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = /** @type {{ result?: unknown; error?: { message: string } }} */ (
    await response.json()
  );
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
};

/** @param {string} url */
const waitForHealth = async (url) => {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ok = await jsonRpc(url, "getHealth")
      .then((r) => r === "ok")
      .catch(() => false);
    if (ok) return;
    await Bun.sleep(100);
  }
  throw new Error(`surfpool did not become healthy on ${url} within ${HEALTH_TIMEOUT_MS}ms`);
};

/**
 * @typedef {{ port?: number; datasourceUrl?: string; slotTimeMs?: number; log?: boolean }} SurfnetOptions
 * @typedef {{
 *   readonly rpcUrl: string;
 *   readonly wsUrl: string;
 *   readonly pid: number;
 *   readonly stop: () => Promise<void>;
 *   readonly kill: () => void;
 * }} SurfnetHandle
 */

/**
 * Start Surfpool. Offline unless `datasourceUrl` is given, in which case mainnet state is
 * forked lazily from that RPC.
 * @param {SurfnetOptions} options
 * @returns {Promise<SurfnetHandle>}
 */
export const startSurfnet = async (options = {}) => {
  const port = options.port ?? freePort();
  const network = options.datasourceUrl ? ["--rpc-url", options.datasourceUrl] : ["--offline"];
  const args = [
    "start",
    "--no-tui",
    "--no-studio",
    "--ci",
    "-p",
    String(port),
    "-w",
    String(port + 1),
    "-t",
    String(options.slotTimeMs ?? 50),
    ...network,
  ];
  const io = options.log ? "inherit" : "ignore";
  const proc = Bun.spawn(["surfpool", ...args], { stdout: io, stderr: io });
  const rpcUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(rpcUrl).catch(async (error) => {
    proc.kill("SIGKILL");
    throw error;
  });
  return {
    rpcUrl,
    wsUrl: `ws://127.0.0.1:${port + 1}`,
    pid: proc.pid,
    /** Synchronous, for process `exit` handlers where awaiting is impossible. */
    kill: () => proc.kill("SIGKILL"),
    stop: async () => {
      proc.kill("SIGTERM");
      const exited = await Promise.race([proc.exited, Bun.sleep(KILL_GRACE_MS).then(() => null)]);
      if (exited === null) proc.kill("SIGKILL");
      await proc.exited;
    },
  };
};

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MINT_RENT_LAMPORTS = 1_461_600;

/**
 * Offline Surfnets have no mainnet mints, so tests materialise one with the program's own codec.
 * @param {string} rpcUrl
 * @param {string} mint
 * @param {number} decimals
 */
const setMint = (rpcUrl, mint, decimals) => {
  const bytes = getMintEncoder().encode({
    mintAuthority: none(),
    supply: 0n,
    decimals,
    isInitialized: true,
    freezeAuthority: none(),
  });
  return jsonRpc(rpcUrl, "surfnet_setAccount", [
    mint,
    {
      lamports: MINT_RENT_LAMPORTS,
      data: getBase16Decoder().decode(bytes),
      owner: TOKEN_PROGRAM,
      executable: false,
    },
  ]);
};

/** Cheatcodes and helpers against a running Surfnet, by URL so attach-mode works too. */
/** @param {string} rpcUrl */
export const surfnetCheatcodes = (rpcUrl) => ({
  /** @param {string} mint @param {number} decimals */
  setMint: (mint, decimals) => setMint(rpcUrl, mint, decimals),
  /** @param {string} owner @param {number} sol */
  fundSol: (owner, sol) => jsonRpc(rpcUrl, "requestAirdrop", [owner, Math.round(sol * 1e9)]),
  /**
   * @param {string} owner
   * @param {string} mint
   * @param {number | string} amount raw base units
   */
  setTokenAccount: (owner, mint, amount) =>
    jsonRpc(rpcUrl, "surfnet_setTokenAccount", [
      owner,
      mint,
      { amount: Number(amount), state: "initialized" },
    ]),
  /** @param {number} slot */
  timeTravelToSlot: (slot) => jsonRpc(rpcUrl, "surfnet_timeTravel", [{ absoluteSlot: slot }]),
  health: () => jsonRpc(rpcUrl, "getHealth"),
});
