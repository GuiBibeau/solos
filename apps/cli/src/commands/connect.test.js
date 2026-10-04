// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { solosServerCommand } from "@solos/mcp";
import { runSolos, stderrJson } from "./cli-fixture.js";

/** @type {string} */
let home = "";
/** @type {string} */
let project = "";
/** The command this checkout's server starts with: what every written entry must carry. */
const expected = solosServerCommand();

beforeAll(async () => {
  home = await mkdtemp(path.join(tmpdir(), "solos-connect-home-"));
  project = await mkdtemp(path.join(tmpdir(), "solos-connect-project-"));
});

afterAll(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

/** @param {string[]} args @param {{ cwd?: string }} [options] */
const connect = async (args, options = {}) => {
  const result = await runSolos(
    ["connect", ...args],
    { HOME: home },
    { cwd: options.cwd ?? project },
  );
  return { ...result, json: result.stdout.trim() === "" ? undefined : JSON.parse(result.stdout) };
};

describe("solos connect writes an MCP client's config [integration]", () => {
  test("--print shows the entry and the target file and writes nothing", async () => {
    const { code, json } = await connect(["cursor", "--print"]);
    expect(code).toBe(0);
    expect(json.written).toBe(false);
    expect(json.file).toBe(path.join(home, ".cursor", "mcp.json"));
    expect(JSON.parse(json.snippet).mcpServers.solos).toEqual({ ...expected, env: {} });
    expect(existsSync(json.file)).toBe(false);
  });

  test("cursor: creates the file, then backs it up before the next write", async () => {
    const first = await connect(["cursor"]);
    expect(first.code).toBe(0);
    expect(first.json.backup).toBeNull();
    expect(first.json.doctor.ok).toBe(false);
    expect(first.json.next).toContain("Cursor");
    const written = JSON.parse(readFileSync(first.json.file, "utf8"));
    expect(written.mcpServers.solos).toEqual({ ...expected, env: {} });

    const second = await connect(["cursor", "--tier", "execute", "--tools", "all"]);
    expect(second.json.backup).toMatch(/mcp\.json\.bak-\d{8}T\d{6}Z$/);
    expect(existsSync(second.json.backup)).toBe(true);
    const updated = JSON.parse(readFileSync(second.json.file, "utf8"));
    expect(updated.mcpServers.solos.args).toEqual([
      ...expected.args,
      "--tier",
      "execute",
      "--tools",
      "all",
    ]);
  });

  test("claude: merges into ~/.claude.json and keeps everything else in it", async () => {
    const file = path.join(home, ".claude.json");
    writeFileSync(
      file,
      JSON.stringify({ theme: "dark", mcpServers: { other: { command: "x", args: [] } } }),
    );
    const { code, json } = await connect(["claude", "--profile", "main"]);
    expect(code).toBe(0);
    expect(json.file).toBe(file);
    const merged = JSON.parse(readFileSync(file, "utf8"));
    expect(merged.theme).toBe("dark");
    expect(merged.mcpServers.other).toEqual({ command: "x", args: [] });
    expect(merged.mcpServers.solos).toEqual({ ...expected, env: { SOLOS_PROFILE: "main" } });
    expect(readdirSync(home).some((name) => name.startsWith(".claude.json.bak-"))).toBe(true);
  });

  test("claude --scope project writes .mcp.json in the current directory", async () => {
    const { code, json } = await connect(["claude", "--scope", "project"], { cwd: project });
    expect(code).toBe(0);
    // The child reports its real cwd; on macOS the temp dir sits behind a /private symlink.
    expect(json.file).toBe(path.join(realpathSync.native(project), ".mcp.json"));
    expect(JSON.parse(readFileSync(json.file, "utf8")).mcpServers.solos.command).toBe(
      expected.command,
    );
  });

  test("codex: adds a TOML table beside existing ones and replaces it on the next run", async () => {
    const file = path.join(home, ".codex", "config.toml");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '[model]\nname = "gpt"\n\n[mcp_servers.other]\ncommand = "other"\n');
    const first = await connect(["codex"]);
    expect(first.code).toBe(0);
    const parsed = /** @type {any} */ (Bun.TOML.parse(readFileSync(file, "utf8")));
    expect(parsed.model).toEqual({ name: "gpt" });
    expect(parsed.mcp_servers.other).toEqual({ command: "other" });
    expect(parsed.mcp_servers.solos).toEqual({ command: expected.command, args: expected.args });

    await connect(["codex", "--tier", "read"]);
    const text = readFileSync(file, "utf8");
    expect(text.split("[mcp_servers.solos]")).toHaveLength(2);
    expect(/** @type {any} */ (Bun.TOML.parse(text)).mcp_servers.solos.args).toEqual([
      ...expected.args,
      "--tier",
      "read",
    ]);
  });

  test("codex --scope project is refused with the envelope and a remedy", async () => {
    const { code, stdout, stderr } = await connect(["codex", "--scope", "project"]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    const envelope = stderrJson(stderr);
    expect(envelope.error.code).toBe("ConnectScopeUnsupported");
    expect(envelope.error.remedy).toContain("--scope user");
  });
});
