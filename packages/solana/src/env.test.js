import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadSolanaEnv } from "./env.js";
import { KAMINO_MAIN_MARKET } from "./lend/kamino-addresses.js";

const MAIN_RPC = "http://127.0.0.1:8899";

/** Run a thunk that must throw and hand back the thrown value. @param {() => unknown} fn */
const thrownBy = (fn) => {
  try {
    fn();
  } catch (error) {
    return /** @type {{ _tag?: string; reason?: string; remedy?: string }} */ (error);
  }
  throw new Error("expected the call to throw");
};

/** @type {string} */
let emptyDir;

/**
 * Test-owned credential store. Every `loadSolanaEnv` call points `SOLOS_CONFIG_DIR` here, so
 * resolution never falls back to the operator's real `~/.config/solos`, which keeps a default
 * wallet profile on QA machines. The store stays credential-free: absent-profile assertions
 * must hold whatever the machine's login state is. Store I/O is filesystem work, so this whole
 * suite is integration scope; pure URL parsing stays in `env-url.test.js`.
 */
beforeAll(() => {
  emptyDir = mkdtempSync(path.join(tmpdir(), "solos-env-empty-"));
});
afterAll(() => rmSync(emptyDir, { recursive: true, force: true }));

describe("solana env resolution [integration]", () => {
  test("requires exactly one signer source", () => {
    // Empty fixture store: must throw even when the machine has a real default profile.
    expect(() => loadSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, SOLANA_RPC_URL: MAIN_RPC })).toThrow();
    expect(() =>
      loadSolanaEnv({
        SOLOS_CONFIG_DIR: emptyDir,
        SOLANA_RPC_URL: MAIN_RPC,
        SOLOS_SIGNER_PRIVATE_KEY: "x",
        SOLOS_SIGNER_KEYPAIR_PATH: "y",
      }),
    ).toThrow();
    expect(
      loadSolanaEnv({
        SOLOS_CONFIG_DIR: emptyDir,
        SOLANA_RPC_URL: MAIN_RPC,
        SOLOS_SIGNER_KEYPAIR_PATH: "/k.json",
      }),
    ).toEqual({
      rpcUrl: MAIN_RPC,
      wsUrl: "ws://127.0.0.1:8900",
      signer: { kind: "keypairPath", path: "/k.json" },
      executor: "direct",
      elfa: { apiKey: undefined, baseUrl: "https://api.elfa.ai" },
      jupiter: { apiKey: undefined, baseUrl: "https://api.jup.ag" },
      phoenix: { baseUrl: "https://perp-api.phoenix.trade" },
      kamino: { market: KAMINO_MAIN_MARKET },
      gateway: { apiKey: undefined, baseUrl: "https://ai-gateway.vercel.sh/v4/ai" },
    });
  });

  test("has no default rpc url", () => {
    expect(
      thrownBy(() => loadSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, SOLOS_SIGNER_PRIVATE_KEY: "x" }))
        ._tag,
    ).toBe("RpcConfigMissing");
  });

  test("a missing signer and a missing rpc url are typed config errors, not defects", () => {
    const signer = thrownBy(() =>
      loadSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, SOLANA_RPC_URL: MAIN_RPC }),
    );
    expect(signer._tag).toBe("SignerConfigMissing");
    expect(signer.reason).toContain("no signer");
    expect(signer.remedy).toContain("solos login");

    const rpc = thrownBy(() =>
      loadSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, SOLOS_SIGNER_PRIVATE_KEY: "x" }),
    );
    expect(rpc._tag).toBe("RpcConfigMissing");
    expect(rpc.reason).toContain("SOLANA_RPC_URL");
    expect(rpc.remedy).toContain("SOLANA_RPC_URL");
  });

  test("an empty store fails with the absent-profile error whatever the machine has", () => {
    const error = thrownBy(() =>
      loadSolanaEnv({ SOLOS_CONFIG_DIR: emptyDir, SOLANA_RPC_URL: MAIN_RPC }),
    );
    expect(error._tag).toBe("SignerConfigMissing");
    expect(error.reason).toContain("solos login");
  });

  test("elfa key is optional and the base url defaults to the production endpoint", () => {
    const env = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
    });
    expect(env.elfa).toEqual({ apiKey: undefined, baseUrl: "https://api.elfa.ai" });
    const withKey = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
      ELFA_API_KEY: "elfa-key",
      ELFA_BASE_URL: "https://api.elfa.ai/",
    });
    expect(withKey.elfa).toEqual({ apiKey: "elfa-key", baseUrl: "https://api.elfa.ai" });

    const fromBlankExample = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
      ELFA_API_KEY: "",
      ELFA_BASE_URL: "",
    });
    expect(fromBlankExample.elfa).toEqual({
      apiKey: undefined,
      baseUrl: "https://api.elfa.ai",
    });
  });

  test("jupiter key is optional and the base url defaults to the production endpoint", () => {
    const env = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
    });
    expect(env.jupiter).toEqual({ apiKey: undefined, baseUrl: "https://api.jup.ag" });
    const withKey = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
      JUPITER_API_KEY: "jup-key",
      JUPITER_BASE_URL: "https://api.jup.ag/",
    });
    expect(withKey.jupiter).toEqual({ apiKey: "jup-key", baseUrl: "https://api.jup.ag" });
    const fromBlankExample = loadSolanaEnv({
      SOLOS_CONFIG_DIR: emptyDir,
      SOLANA_RPC_URL: MAIN_RPC,
      SOLOS_SIGNER_PRIVATE_KEY: "x",
      JUPITER_API_KEY: "",
      JUPITER_BASE_URL: "",
    });
    expect(fromBlankExample.jupiter).toEqual({
      apiKey: undefined,
      baseUrl: "https://api.jup.ag",
    });
  });
});
