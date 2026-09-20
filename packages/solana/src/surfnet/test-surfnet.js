// @ts-check
/**
 * Shared Surfnet for integration tests. One process per `bun test` run, started on first use,
 * attached instead when SURFNET_RPC_URL points at a running instance.
 */
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { address, getAddressEncoder } from "@solana/kit";
import { deriveWsUrl } from "../env.js";
import { startSurfnet, surfnetCheatcodes } from "./surfnet-cli.js";

/** @type {Promise<{ rpcUrl: string; wsUrl: string }> | undefined} */
let shared;
/** @type {Promise<{ rpcUrl: string; wsUrl: string }> | undefined} */
let offlineShared;

/** @param {string | undefined} datasourceUrl */
const startForTests = async (datasourceUrl) => {
  const handle = await startSurfnet({
    datasourceUrl,
    // Used by nightly's verify command, which captures and redacts failed-step output.
    log: process.env.SURFNET_DIAGNOSTICS === "1",
  });
  const register =
    /** @type {{ __solosRegisterStopper?: (handle: { stop: () => Promise<void>; kill: () => void }) => void }} */ (
      globalThis
    ).__solosRegisterStopper;
  if (register) register(handle);
  else process.on("exit", handle.kill);
  return { rpcUrl: handle.rpcUrl, wsUrl: handle.wsUrl };
};

const attachOrStart = async () => {
  const attached = process.env.SURFNET_RPC_URL;
  if (attached) return { rpcUrl: attached, wsUrl: deriveWsUrl(attached) };
  return startForTests(process.env.SURFNET_DATASOURCE_RPC_URL);
};

/** @returns {Promise<{ rpcUrl: string; wsUrl: string; cheats: ReturnType<typeof surfnetCheatcodes> }>} */
export const ensureSurfnet = async () => {
  shared ??= attachOrStart();
  const { rpcUrl, wsUrl } = await shared;
  return { rpcUrl, wsUrl, cheats: surfnetCheatcodes(rpcUrl) };
};

/** Synthetic fixtures use an offline instance even when nightly also runs an online fork. */
export const ensureOfflineSurfnet = async () => {
  if (!process.env.SURFNET_RPC_URL && !process.env.SURFNET_DATASOURCE_RPC_URL) {
    return ensureSurfnet();
  }
  offlineShared ??= startForTests(undefined);
  const { rpcUrl, wsUrl } = await offlineShared;
  return { rpcUrl, wsUrl, cheats: surfnetCheatcodes(rpcUrl) };
};

/** 32 random bytes usable as an ed25519 seed for `KitSignerFromBytes` or a private-key string. */
export const randomSeed = () => crypto.getRandomValues(new Uint8Array(32));

/**
 * Public address for a seed, so tests can fund a wallet before the process under test starts.
 * @param {Uint8Array} seed
 */
export const seedAddress = async (seed) => (await createMemorySignerFromBytes(seed)).address;

/**
 * keychain-memory wants the Solana CLI shape: a JSON array of 64 bytes, seed then public key.
 * @param {Uint8Array} seed
 */
export const seedToPrivateKeyString = async (seed) => {
  const publicKey = getAddressEncoder().encode(address(await seedAddress(seed)));
  return JSON.stringify([...seed, ...publicKey]);
};

/** Mainnet USDC mint, present on any mainnet fork and harmless offline as a synthetic mint. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
