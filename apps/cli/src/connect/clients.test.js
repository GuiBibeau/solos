// @ts-check
import { describe, expect, test } from "bun:test";
import { CLIENTS } from "./clients.js";

const entry = { command: "solos", args: ["mcp", "serve"], env: {} };
const dirs = { home: "/home/op", cwd: "/work/project" };

describe("client adapters", () => {
  test("each client knows its config file per scope", () => {
    expect(CLIENTS.claude.file("user", dirs)).toBe("/home/op/.claude.json");
    expect(CLIENTS.claude.file("project", dirs)).toBe("/work/project/.mcp.json");
    expect(CLIENTS.cursor.file("user", dirs)).toBe("/home/op/.cursor/mcp.json");
    expect(CLIENTS.cursor.file("project", dirs)).toBe("/work/project/.cursor/mcp.json");
    expect(CLIENTS.codex.file("user", dirs)).toBe("/home/op/.codex/config.toml");
    expect(CLIENTS.codex.scopes).toEqual(["user"]);
  });

  test("a JSON merge keeps every other key and server, and overwrites only solos", () => {
    const existing = JSON.stringify({
      theme: "dark",
      mcpServers: { other: { command: "x" }, solos: { command: "stale" } },
    });
    const merged = JSON.parse(CLIENTS.claude.merge(existing, entry));
    expect(merged).toEqual({
      theme: "dark",
      mcpServers: { other: { command: "x" }, solos: entry },
    });
  });

  test("a missing file or one without mcpServers gets the key created", () => {
    expect(JSON.parse(CLIENTS.cursor.merge(null, entry))).toEqual({ mcpServers: { solos: entry } });
    expect(JSON.parse(CLIENTS.cursor.merge('{"a":1}', entry))).toEqual({
      a: 1,
      mcpServers: { solos: entry },
    });
  });

  test("a config that is not a JSON object is refused rather than clobbered", () => {
    expect(() => CLIENTS.claude.merge("[1,2]", entry)).toThrow("not a JSON object");
    expect(() => CLIENTS.claude.merge("{ not json", entry)).toThrow();
  });

  test("the printed snippet is the mcpServers shape for JSON clients", () => {
    expect(JSON.parse(CLIENTS.cursor.render(entry))).toEqual({ mcpServers: { solos: entry } });
  });
});
