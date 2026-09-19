// @ts-check
import { describe, expect, test } from "bun:test";
import { PUMP_PROGRAM } from "./pump-program.js";
import {
  expectedFixtureCurve,
  GLOBAL_BYTES,
  readAt,
  randomMint,
  startCurveServer,
  SYSTEM_PROGRAM,
} from "./rpc-fixture.js";

/**
 * Global-config reads and failures over raw loopback JSON-RPC servers: progress needs the
 * protocol's live initial-real-reserve configuration, and any Global failure is the distinct
 * `CurveConfigUnavailable` tag — never a guessed constant and never a curve failure.
 */

describe("launch curve Global-config reads [integration]", () => {
  test("a good curve and Global over raw JSON-RPC decode to the full LaunchCurve", async () => {
    const mint = randomMint();
    const server = await startCurveServer(mint, { owner: PUMP_PROGRAM, data: GLOBAL_BYTES });
    try {
      expect(await readAt(server.url, mint)).toEqual(expectedFixtureCurve(mint));
    } finally {
      server.stop();
    }
  });

  test("an absent Global config fails CurveConfigUnavailable, never a guessed constant", async () => {
    const mint = randomMint();
    const server = await startCurveServer(mint, null);
    try {
      expect(await readAt(server.url, mint)).toMatchObject({
        _tag: "CurveConfigUnavailable",
        reason: "Global config account is absent",
      });
    } finally {
      server.stop();
    }
  });

  test("a Global shorter than the stable prefix fails CurveConfigUnavailable", async () => {
    const mint = randomMint();
    const server = await startCurveServer(mint, {
      owner: PUMP_PROGRAM,
      data: GLOBAL_BYTES.slice(0, 96),
    });
    try {
      expect(await readAt(server.url, mint)).toMatchObject({
        _tag: "CurveConfigUnavailable",
        reason: "Global config account is shorter than the stable layout prefix",
      });
    } finally {
      server.stop();
    }
  });

  test("a Global owned by another program fails CurveConfigUnavailable", async () => {
    const mint = randomMint();
    const server = await startCurveServer(mint, { owner: SYSTEM_PROGRAM, data: GLOBAL_BYTES });
    try {
      expect(await readAt(server.url, mint)).toMatchObject({
        _tag: "CurveConfigUnavailable",
        reason: "Global config account is not owned by the pinned pump program",
      });
    } finally {
      server.stop();
    }
  });
});
