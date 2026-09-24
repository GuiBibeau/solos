// @ts-check
import { expect, test } from "bun:test";
import { ensureOfflineSurfnet } from "@solos/solana/surfnet";
import { runSolos, solanaEnv, stderrJson } from "./cli-fixture.js";

test("CLI Phoenix reduce-only close twins [integration] reject a missing executable price before sending", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const env = await solanaEnv(surfnet);
  for (const command of ["simulate-close", "close"]) {
    const { stderr, code } = await runSolos(
      ["perp", command, "--market", "SOL", "--limit-price-usd", "0"],
      env,
    );
    expect(code).not.toBe(0);
    expect(stderrJson(stderr)?.error.code).toBe("PerpInputInvalid");
  }
}, 15_000);
