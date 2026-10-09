// @ts-check
import { describe, expect, test } from "bun:test";
import { registryHasVersion } from "./registry.js";

const SERVER = { name: "io.github.GuiBibeau/solos", version: "0.1.1" };
const record = (/** @type {string} */ version, /** @type {string} */ status) =>
  `{"server":{"name":"io.github.GuiBibeau/solos","version":"${version}"},"_meta":{"io.modelcontextprotocol.registry/official":{"status":"${status}"}}}\n200`;
const listed = (/** @type {string} */ status) => record("0.1.1", status);

/** @type {string[][]} */
const seen = [];
const answer =
  (/** @type {number} */ code, /** @type {string} */ output) =>
  async (/** @type {string[]} */ argv) => {
    seen.push(argv);
    return { code, output };
  };

describe("the registry probe", () => {
  test("asks for deleted versions too and answers on 200 or 404", async () => {
    expect(await registryHasVersion(SERVER, answer(0, listed("active")))).toBe(true);
    expect(seen[0]).toEqual([
      "curl",
      "-sS",
      "-w",
      String.raw`\n%{http_code}`,
      "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.GuiBibeau%2Fsolos/versions/0.1.1?include_deleted=true",
    ]);
    expect(await registryHasVersion(SERVER, answer(0, '{"detail":"not found"}\n404\n'))).toBe(
      false,
    );
    expect(await registryHasVersion(SERVER, answer(0, "404"))).toBe(false);
    const bare = '{"server":{"name":"io.github.GuiBibeau/solos","version":"0.1.1"}}\n200';
    expect(await registryHasVersion(SERVER, answer(0, bare))).toBe(true);
  });

  test("a deleted or deprecated version is refused; only an active one is promoted", async () => {
    const remedy =
      "fix forward: prepare a patch release and promote it; a deprecated version can instead be set back to active in the registry first";
    await expect(registryHasVersion(SERVER, answer(0, listed("deleted")))).rejects.toMatchObject({
      _tag: "ReleaseRefused",
      reason:
        "io.github.GuiBibeau/solos@0.1.1 is deleted in the MCP Registry; only an active version is promoted",
      remedy,
    });
    await expect(registryHasVersion(SERVER, answer(0, listed("deprecated")))).rejects.toMatchObject(
      {
        reason:
          "io.github.GuiBibeau/solos@0.1.1 is deprecated in the MCP Registry; only an active version is promoted",
        remedy,
      },
    );
  });

  test("anything but a readable 200 or a 404 refuses before a pointer moves", async () => {
    await expect(registryHasVersion(SERVER, answer(0, "\n503"))).rejects.toMatchObject({
      _tag: "ReleaseRefused",
      reason:
        "MCP Registry lookup for io.github.GuiBibeau/solos@0.1.1 failed (HTTP 503); nothing was changed",
    });
    await expect(registryHasVersion(SERVER, answer(6, "000"))).rejects.toMatchObject({
      reason:
        "MCP Registry lookup for io.github.GuiBibeau/solos@0.1.1 failed (curl exit 6); nothing was changed",
    });
    const notRecord =
      "MCP Registry lookup for io.github.GuiBibeau/solos@0.1.1 failed (HTTP 200 with a body that is not the registry's record of io.github.GuiBibeau/solos@0.1.1); nothing was changed";
    for (const body of [
      "<html>busy</html>\n200",
      "{}\n200",
      '{"error":"busy"}\n200',
      record("0.1.0", "active"),
      record("0.1.1", "archived"),
    ]) {
      await expect(registryHasVersion(SERVER, answer(0, body))).rejects.toMatchObject({
        reason: notRecord,
      });
    }
  });
});
