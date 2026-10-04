// @ts-check
import { describe, expect, test } from "bun:test";
import { mergeCodexConfig, renderCodexTable } from "./toml.js";

const entry = {
  command: "/usr/local/bin/solos",
  args: ["mcp", "serve", "--tier", "execute"],
  env: { SOLOS_PROFILE: "main" },
};

describe("the Codex TOML table for solos", () => {
  test("renders a table Bun's TOML parser reads back exactly", () => {
    const parsed = Bun.TOML.parse(renderCodexTable(entry));
    expect(parsed).toEqual({ mcp_servers: { solos: entry } });
  });

  test("omits env when there is nothing to put in it", () => {
    const text = renderCodexTable({ ...entry, env: {} });
    expect(text).not.toContain("env");
    expect(Bun.TOML.parse(text)).toEqual({
      mcp_servers: { solos: { command: entry.command, args: entry.args } },
    });
  });

  test("a missing or empty file becomes just the table", () => {
    expect(mergeCodexConfig(null, entry)).toBe(renderCodexTable(entry));
    expect(mergeCodexConfig("\n", entry)).toBe(renderCodexTable(entry));
  });

  test("appends after existing tables and keeps them intact", () => {
    const existing = '[model]\nname = "gpt"\n\n[mcp_servers.other]\ncommand = "other"\n';
    const merged = mergeCodexConfig(existing, entry);
    expect(Bun.TOML.parse(merged)).toEqual({
      model: { name: "gpt" },
      mcp_servers: { other: { command: "other" }, solos: entry },
    });
  });

  test("replaces an existing solos table in place, tables before and after untouched", () => {
    const existing = [
      "[model]",
      'name = "gpt"',
      "",
      "[mcp_servers.solos]",
      'command = "bun"',
      'args = ["old"]',
      "",
      "[mcp_servers.other]",
      'command = "other"',
      "",
    ].join("\n");
    const merged = mergeCodexConfig(existing, entry);
    expect(merged.split("[mcp_servers.solos]")).toHaveLength(2);
    expect(Bun.TOML.parse(merged)).toEqual({
      model: { name: "gpt" },
      mcp_servers: { solos: entry, other: { command: "other" } },
    });
  });
});
