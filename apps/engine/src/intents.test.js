// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { claimIntent, failIntent, openIntents, readIntent, settleIntent } from "./intents.js";

/** @type {string | undefined} */
let dir;

afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

const database = () => {
  dir = mkdtempSync(path.join(tmpdir(), "solos-intents-"));
  return openIntents(path.join(dir, "intents.sqlite"));
};

describe("intent store [integration]", () => {
  test("the first claim wins and a second claim while in flight does not", () => {
    const db = database();
    expect(claimIntent(db, "one").state).toBe("claimed");
    expect(claimIntent(db, "one").state).toBe("in_flight");
    expect(readIntent(db, "missing").state).toBe("missing");
    db.close();
  });

  test("a settled intent replays its result and a failed intent replays its envelope", () => {
    const db = database();
    claimIntent(db, "ok");
    settleIntent(db, "ok", { signature: "sig", status: "confirmed" });
    const settled = readIntent(db, "ok");
    expect(settled.state).toBe("settled");
    if (settled.state === "settled")
      expect(settled.result).toEqual({ signature: "sig", status: "confirmed" });

    claimIntent(db, "bad");
    failIntent(db, "bad", { code: "SimulationFailed", reason: "nope" });
    const failed = readIntent(db, "bad");
    expect(failed.state).toBe("failed");
    if (failed.state === "failed")
      expect(failed.error).toEqual({ code: "SimulationFailed", reason: "nope" });
    db.close();
  });
});
