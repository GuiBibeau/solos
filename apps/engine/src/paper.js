// @ts-check
import { SurfpoolUnavailable } from "@solos/core";
import { startSurfnet, surfnetCheatcodes } from "@solos/solana/surfnet";

/** Paper funds the signer with this much SOL. Enough for a small transfer and its fee. */
const PAPER_SOL = 2;

/**
 * Offline Surfpool, the same helper the tests use. Nothing here points at mainnet.
 * A missing binary fails before spawn, with a remedy that names the flag.
 */
export const bootPaper = async () => {
  if (Bun.which("surfpool") === null) {
    throw new SurfpoolUnavailable({
      reason: "the surfpool binary is not on PATH, so paper mode cannot start",
      remedy: "install surfpool and retry with --paper",
    });
  }
  const handle = await startSurfnet().catch(() => {
    throw new SurfpoolUnavailable({
      reason: "surfpool did not become healthy",
      remedy: "install surfpool, check that it runs, and retry with --paper",
    });
  });
  const cheats = surfnetCheatcodes(handle.rpcUrl);
  return {
    rpcUrl: handle.rpcUrl,
    wsUrl: handle.wsUrl,
    /** @param {string} owner */
    fund: (owner) => cheats.fundSol(owner, PAPER_SOL),
    stop: () => handle.stop(),
  };
};
