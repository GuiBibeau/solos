// @ts-check
import { describe, expect, test } from "bun:test";
import { PHOENIX_PERPS_PROGRAM, RISE_REVISION, RISE_SDK_VERSION } from "./phoenix-api.js";

describe("pinned revisions (ADR-0021)", () => {
  test("the adapter pins the production program and the verified Rise revision", () => {
    expect(PHOENIX_PERPS_PROGRAM).toBe("EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih");
    expect(RISE_REVISION).toBe("4bd3c505f16f09fdbe9fb2eff035aeaef8b7b12d");
    expect(RISE_SDK_VERSION).toBe("0.5.26");
  });
});
