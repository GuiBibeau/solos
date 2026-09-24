// @ts-check
import { expect, test } from "bun:test";
import { ensureOfflineSurfnet } from "@solos/solana/surfnet";
import { runSolos, solanaEnv, stderrJson } from "./cli-fixture.js";

test("CLI Phoenix IOC open [integration] rejects malformed notional before any order can be sent", async () => {
  const surfnet = await ensureOfflineSurfnet();
  const env = await solanaEnv(surfnet);
  const { stderr, code } = await runSolos(
    [
      "perp",
      "simulate-open",
      "--market",
      "SOL",
      "--side",
      "long",
      "--notional-usd",
      "0",
      "--max-leverage",
      "2",
      "--limit-price-usd",
      "150",
    ],
    env,
  );
  expect(code).not.toBe(0);
  expect(stderrJson(stderr)?.error.code).toBe("PerpInputInvalid");
}, 15_000);
