import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedAddress, seedToPrivateKeyString } from "../surfnet/test-surfnet.js";
import { discoverSolanaCliKeypairs, parsePayAccounts } from "./discover.js";

/** @type {string} */
let dir;
/** @type {string} */
let address;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "solos-solana-cli-"));
  const seed = randomSeed();
  address = await seedAddress(seed);
  writeFileSync(path.join(dir, "id.json"), await seedToPrivateKeyString(seed));
  writeFileSync(path.join(dir, "cli.yml"), "json_rpc_url: x\n");
  writeFileSync(path.join(dir, "broken.json"), "[1,2,3]");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("local wallet discovery", () => {
  test("finds valid Solana CLI keypairs and skips the rest", async () => {
    const found = await discoverSolanaCliKeypairs(dir);
    expect(found).toEqual([{ provider: "local", keypairPath: path.join(dir, "id.json"), address }]);
  });

  test("reads pay accounts.yml without touching secrets", () => {
    const yaml = [
      "version: 1",
      "accounts:",
      "  mainnet:",
      "    trading:",
      "      keystore: apple-keychain",
      "      pubkey: 7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY",
      "  devnet:",
      "    default:",
      "      keystore: file",
      "      pubkey: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "      secret_key_b58: never-read",
      "",
    ].join("\n");
    expect(parsePayAccounts(yaml)).toEqual([
      {
        provider: "pay",
        account: "trading",
        network: "mainnet",
        address: "7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY",
      },
      {
        provider: "pay",
        account: "default",
        network: "devnet",
        address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      },
    ]);
  });
});
