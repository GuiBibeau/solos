// @ts-check
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Args, Command, Options } from "@effect/cli";
import { deriveWsUrl } from "@solos/solana";
import { jsonRpc, surfnetCheatcodes } from "@solos/solana/surfnet";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";

const STATE_DIR = ".solos";
const STATE_FILE = `${STATE_DIR}/surfpool.json`;
const DEFAULT_PORT = 8899;

/** @typedef {{ pid: number; rpcUrl: string; wsUrl: string; offline: boolean }} SurfpoolState */

/** @returns {SurfpoolState | undefined} */
const readState = () =>
  existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : undefined;

/** @param {string} rpcUrl */
const isHealthy = (rpcUrl) =>
  jsonRpc(rpcUrl, "getHealth")
    .then((r) => r === "ok")
    .catch(() => false);

/** @param {string} rpcUrl */
const waitHealthy = async (rpcUrl) => {
  for (let i = 0; i < 100; i += 1) {
    if (await isHealthy(rpcUrl)) return true;
    await Bun.sleep(100);
  }
  return false;
};

const port = Options.integer("port").pipe(Options.withDefault(DEFAULT_PORT));
const datasource = Options.text("datasource").pipe(
  Options.optional,
  Options.withDescription("Mainnet RPC to fork from. Offline when omitted."),
);

const up = Command.make("up", { port, datasource }, (options) =>
  Effect.promise(async () => {
    const running = readState();
    if (running && (await isHealthy(running.rpcUrl))) return { ...running, alreadyRunning: true };
    mkdirSync(STATE_DIR, { recursive: true });
    const p = String(options.port);
    const args = [
      "start",
      "--no-tui",
      "--no-studio",
      "--ci",
      "-p",
      p,
      "-w",
      String(options.port + 1),
    ];
    const forkArgs =
      options.datasource._tag === "Some" ? ["--rpc-url", options.datasource.value] : ["--offline"];
    const child = spawn("surfpool", [...args, ...forkArgs], { detached: true, stdio: "ignore" });
    child.unref();
    const rpcUrl = `http://127.0.0.1:${p}`;
    /** @type {SurfpoolState} */
    const state = {
      pid: child.pid ?? -1,
      rpcUrl,
      wsUrl: deriveWsUrl(rpcUrl),
      offline: forkArgs[0] === "--offline",
    };
    writeFileSync(STATE_FILE, JSON.stringify(state));
    if (!(await waitHealthy(rpcUrl))) throw new Error("surfpool did not become healthy");
    return { ...state, alreadyRunning: false, hint: `export SOLANA_RPC_URL=${rpcUrl}` };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(Command.withDescription("Start a detached local Surfpool (offline unless --datasource)"));

const down = Command.make("down", {}, () =>
  Effect.sync(() => {
    const state = readState();
    if (!state) return { stopped: false, reason: "not running" };
    try {
      process.kill(state.pid, "SIGKILL");
    } catch {
      // already gone
    }
    rmSync(STATE_FILE, { force: true });
    return { stopped: true, pid: state.pid };
  }).pipe(Effect.flatMap(emit)),
).pipe(Command.withDescription("Stop the local Surfpool started by `up`"));

const status = Command.make("status", {}, () =>
  Effect.promise(async () => {
    const state = readState();
    return state ? { ...state, healthy: await isHealthy(state.rpcUrl) } : { running: false };
  }).pipe(Effect.flatMap(emit)),
);

const cheats = () => {
  const state = readState();
  if (!state) throw new Error("surfpool is not running; run `solos dev surfpool up` first");
  return surfnetCheatcodes(state.rpcUrl);
};

const owner = Args.text({ name: "owner" });
const sol = Options.float("sol").pipe(Options.withDescription("Amount of SOL to airdrop"));
const fund = Command.make("fund", { owner, sol }, (o) =>
  Effect.promise(() => cheats().fundSol(o.owner, o.sol))
    .pipe(
      Effect.map((signature) => ({ owner: o.owner, sol: o.sol, signature })),
      Effect.flatMap(emit),
    )
    .pipe(exitOnFailure),
).pipe(Command.withDescription("Airdrop SOL on the local Surfpool"));

const mint = Options.text("mint");
const amount = Options.text("amount").pipe(Options.withDescription("Raw base units"));
const decimals = Options.integer("decimals").pipe(
  Options.optional,
  Options.withDescription("Create the mint offline with these decimals"),
);
const setToken = Command.make("set-token", { owner, mint, amount, decimals }, (o) =>
  Effect.promise(async () => {
    const c = cheats();
    if (o.decimals._tag === "Some") await c.setMint(o.mint, o.decimals.value);
    await c.setTokenAccount(o.owner, o.mint, o.amount);
    return { owner: o.owner, mint: o.mint, amount: o.amount };
  }).pipe(Effect.flatMap(emit), exitOnFailure),
).pipe(Command.withDescription("Set a token balance on the local Surfpool"));

export const surfpool = Command.make("surfpool").pipe(
  Command.withDescription("Manage a local Surfpool for tests and manual verification"),
  Command.withSubcommands([up, down, status, fund, setToken]),
);
