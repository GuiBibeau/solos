// @ts-check
import { expect, test } from "bun:test";
import { inspectCheckpointInventory } from "./checkpoint-inventory.js";

/** @param {string} name @param {() => Promise<unknown>} getSandbox */
const context = (name, getSandbox) =>
  /** @type {import("eve/hooks").HookContext} */ ({
    agent: { name },
    channel: {},
    getSandbox,
    session: { id: "run", turn: { id: "turn", sequence: 1 } },
  });

test("stations without a checkout record an explicit empty inventory", async () => {
  let wasRequested = false;
  const result = await inspectCheckpointInventory(
    context("researcher", async () => {
      wasRequested = true;
      throw new Error("no sandbox");
    }),
  );
  expect(wasRequested).toBe(false);
  expect(result).toEqual({ dirty: false, dirtyFiles: [] });
});

test("repository stations inspect branch, head, and dirty files", async () => {
  const outputs = ["codex/work\n", `${"a".repeat(40)}\n`, "M  path/to/file.js\n"];
  const result = await inspectCheckpointInventory(
    context(
      "implementer",
      async () =>
        /** @type {import("eve/sandbox").SandboxSession} */ ({
          run: async () => ({ exitCode: 0, stdout: outputs.shift() }),
        }),
    ),
  );
  expect(result).toEqual({
    dirty: true,
    dirtyFiles: ["path/to/file.js"],
    head: "a".repeat(40),
    name: "codex/work",
  });
});

test("repository inventory fails closed when git inspection fails", async () => {
  await expect(
    inspectCheckpointInventory(
      context(
        "reviewer",
        async () =>
          /** @type {import("eve/sandbox").SandboxSession} */ ({
            run: async () => ({ exitCode: 1, stdout: "" }),
          }),
      ),
    ),
  ).rejects.toThrow("Checkpoint inventory failed.");
});
