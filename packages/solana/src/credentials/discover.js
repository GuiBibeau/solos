// @ts-check
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createMemorySignerFromKeypairFile } from "@solana/keychain-memory";
import { payAccountsPath, solanaCliDir } from "./paths.js";

/**
 * @typedef {{ provider: "local"; keypairPath: string; address: string }
 *   | { provider: "pay"; account: string; network: string; address: string }} DiscoveredWallet
 */

/**
 * Solana CLI keypair files under ~/.config/solana. Unreadable files are skipped, not fatal.
 * @param {string} [dir]
 * @returns {Promise<DiscoveredWallet[]>}
 */
export const discoverSolanaCliKeypairs = async (dir = solanaCliDir()) => {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const found = await Promise.all(
    files.map(async (file) => {
      const keypairPath = path.join(dir, file);
      try {
        const signer = await createMemorySignerFromKeypairFile(keypairPath);
        return /** @type {DiscoveredWallet} */ ({
          provider: "local",
          keypairPath,
          address: signer.address,
        });
      } catch {
        return undefined;
      }
    }),
  );
  return found.filter((w) => w !== undefined);
};

/**
 * Accounts registered by the `pay` CLI. Only public data is read here; the secret stays in
 * pay's own store until `pay account export` is asked for it.
 * @param {string} [file]
 * @returns {DiscoveredWallet[]}
 */
export const discoverPayAccounts = (file = payAccountsPath()) => {
  if (!existsSync(file)) return [];
  return parsePayAccounts(readFileSync(file, "utf8"));
};

const LINE_PATTERNS =
  /** @type {ReadonlyArray<[kind: "network" | "account" | "pubkey", re: RegExp]>} */ ([
    ["network", /^ {2}(\w[\w-]*):\s*$/],
    ["account", /^ {4}([\w-]+):\s*$/],
    ["pubkey", /^ {6}pubkey:\s*"?([1-9A-HJ-NP-Za-km-z]{32,44})"?\s*$/],
  ]);

/** @param {string} line */
const classifyLine = (line) => {
  for (const [kind, re] of LINE_PATTERNS) {
    const value = re.exec(line)?.[1];
    if (value) return { kind, value };
  }
  return undefined;
};

/**
 * @typedef {{ network: string; account: string; wallets: DiscoveredWallet[] }} ParseState
 * @param {ParseState} state
 * @param {{ kind: "network" | "account" | "pubkey"; value: string } | undefined} token
 */
const applyLine = (state, token) => {
  if (token === undefined) return;
  if (token.kind === "network") state.network = token.value;
  else if (token.kind === "account") state.account = token.value;
  else if (state.account) {
    state.wallets.push({
      provider: "pay",
      account: state.account,
      network: state.network,
      address: token.value,
    });
  }
};

/**
 * Minimal reader for pay's accounts.yml: `accounts: <network>: <name>: pubkey: <base58>`.
 * @param {string} yaml
 * @returns {DiscoveredWallet[]}
 */
export const parsePayAccounts = (yaml) => {
  /** @type {ParseState} */
  const state = { network: "", account: "", wallets: [] };
  for (const line of yaml.split("\n")) applyLine(state, classifyLine(line));
  return state.wallets;
};

/** Everything this machine already has that could sign. */
export const discoverLocalWallets = async () => [
  ...(await discoverSolanaCliKeypairs()),
  ...discoverPayAccounts(),
];
