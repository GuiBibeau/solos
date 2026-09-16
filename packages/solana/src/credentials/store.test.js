import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { credentialsPath } from "./paths.js";
import { selectProfile, sourceFromProfile } from "./resolve.js";
import { readCredentials, removeProfile, saveProfile, setDefaultProfile } from "./store.js";

const ADDR = "7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY";
/** @type {string} */
let dir;
/** @type {Record<string, string>} */
let env;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "solos-creds-"));
  env = { SOLOS_CONFIG_DIR: dir, PRIVY_SECRET: "shh" };
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("credentials store", () => {
  test("first profile becomes default; file is 0600", () => {
    const file = saveProfile(env, {
      name: "laptop",
      profile: {
        provider: "local",
        keypairPath: "/tmp/id.json",
        wallet: { address: ADDR },
        createdAt: 1,
      },
    });
    expect(file).toBe(credentialsPath(env));
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readCredentials(env).default).toBe("laptop");
  });

  test("selects SOLOS_PROFILE over default and resolves secret refs", () => {
    saveProfile(env, {
      name: "privy-main",
      profile: {
        provider: "privy-server",
        appId: "app",
        appSecret: "$PRIVY_SECRET",
        walletId: "w1",
        wallet: { address: ADDR },
        createdAt: 2,
      },
    });
    expect(selectProfile(env)?.name).toBe("laptop");
    const picked = selectProfile({ ...env, SOLOS_PROFILE: "privy-main" });
    expect(picked?.name).toBe("privy-main");
    expect(sourceFromProfile(picked.profile, env)).toEqual({
      kind: "privy-server",
      appId: "app",
      appSecret: "shh",
      walletId: "w1",
    });
    expect(() => selectProfile({ ...env, SOLOS_PROFILE: "nope" })).toThrow(/not found/);
  });

  test("default moves on remove; explicit default set", () => {
    setDefaultProfile(env, "privy-main");
    expect(readCredentials(env).default).toBe("privy-main");
    removeProfile(env, "privy-main");
    expect(readCredentials(env).default).toBe("laptop");
    expect(Object.keys(readCredentials(env).profiles)).toEqual(["laptop"]);
  });

  test("rejects malformed files loudly", () => {
    expect(() =>
      saveProfile(env, {
        name: "Bad Name",
        profile: { provider: "pay", account: "x", wallet: { address: ADDR }, createdAt: 1 },
      }),
    ).toThrow();
  });
});
