// @ts-check
import { describe, expect, test } from "bun:test";
import { EngineUnavailable, SimulationFailed } from "@solos/core";
import { engineErrorFromBody, engineTransportError } from "./engine-error.js";

const SECRET_URL = "http://127.0.0.1:9/secret-path?q=secret-query";

describe("engine error translation", () => {
  test("rebuilds a known tagged error from the envelope", () => {
    const error = engineErrorFromBody(
      { error: { code: "SimulationFailed", reason: "the transaction would fail", logs: ["a"] } },
      SECRET_URL,
    );
    expect(error).toBeInstanceOf(SimulationFailed);
    expect(error.reason).toBe("the transaction would fail");
    expect(/** @type {SimulationFailed} */ (error).logs).toEqual(["a"]);
  });

  test("an unknown code becomes EngineUnavailable and the url is the origin only", () => {
    const error = /** @type {EngineUnavailable} */ (
      engineErrorFromBody({ error: { code: "NotARealCode", reason: "nope" } }, SECRET_URL)
    );
    expect(error).toBeInstanceOf(EngineUnavailable);
    expect(error.url).toBe("http://127.0.0.1:9");
    expect(error.reason).toBe("nope");
    expect(JSON.stringify(error)).not.toContain("secret-path");
    expect(JSON.stringify(error)).not.toContain("secret-query");
  });

  test("a body that is not an envelope is EngineUnavailable", () => {
    const error = /** @type {EngineUnavailable} */ (engineErrorFromBody({ ok: false }, SECRET_URL));
    expect(error._tag).toBe("EngineUnavailable");
    expect(error.url).toBe("http://127.0.0.1:9");
  });

  test("a transport failure does not echo the thrown message", () => {
    const error = /** @type {EngineUnavailable} */ (
      engineTransportError(new Error(`connect failed ${SECRET_URL}`), SECRET_URL)
    );
    expect(error._tag).toBe("EngineUnavailable");
    expect(error.reason).toBe("the engine did not answer");
    expect(JSON.stringify(error)).not.toContain("secret");
  });

  test("a tagged error passes through transport translation", () => {
    const original = new SimulationFailed({ reason: "kept", logs: [] });
    expect(engineTransportError(original, "http://127.0.0.1:1")).toBe(original);
  });
});
