// @ts-check
import { afterEach, expect, test } from "bun:test";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { modelOptionsFor } from "./models.js";
import { createZaiModel } from "./zai-model.js";

const originalKey = process.env.ZAI_CODING_API_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.ZAI_CODING_API_KEY;
  else process.env.ZAI_CODING_API_KEY = originalKey;
});

/** @param {boolean} first */
const completion = (first) => ({
  choices: [
    {
      finish_reason: first ? "tool_calls" : "stop",
      index: 0,
      message: first
        ? {
            content: null,
            reasoning_content: "Use the echo tool.",
            role: "assistant",
            tool_calls: [
              {
                function: { arguments: '{"value":"ok"}', name: "echo" },
                id: "call_echo",
                type: "function",
              },
            ],
          }
        : { content: "ok", role: "assistant" },
    },
  ],
  id: "fixture",
  model: "glm-5.3-flash",
  object: "chat.completion",
  usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 },
});

test("[integration] Z.ai authenticates and preserves reasoning across a real tool round trip", async () => {
  process.env.ZAI_CODING_API_KEY = "local-fixture-key";
  /** @type {{ path: string; auth: string | null; body: Record<string, unknown> }[]} */
  const requests = [];
  const server = Bun.serve({
    async fetch(request) {
      requests.push({
        auth: request.headers.get("authorization"),
        body: await request.json(),
        path: new URL(request.url).pathname,
      });
      return Response.json(completion(requests.length === 1));
    },
    port: 0,
  });
  try {
    const result = await generateText({
      maxRetries: 0,
      model: createZaiModel("glm-5.3-flash", `${server.url}api/coding/paas/v4`),
      prompt: "Echo ok using the tool.",
      ...modelOptionsFor("zai/glm-5.3-flash"),
      stopWhen: stepCountIs(2),
      tools: {
        echo: tool({ execute: ({ value }) => value, inputSchema: z.object({ value: z.string() }) }),
      },
    });
    expect(result.text).toBe("ok");
    expect(requests).toHaveLength(2);
    expect(
      requests.every(
        (r) =>
          r.auth === "Bearer local-fixture-key" &&
          r.path === "/api/coding/paas/v4/chat/completions",
      ),
    ).toBe(true);
    expect(requests[1]?.body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasoning_content: "Use the echo tool.", role: "assistant" }),
      ]),
    );
    expect(requests[0]?.body.thinking).toEqual({ clear_thinking: false, type: "enabled" });
  } finally {
    await server.stop(true);
  }
});

test("[integration] missing Z.ai key fails before any HTTP request", async () => {
  delete process.env.ZAI_CODING_API_KEY;
  await expect(
    generateText({
      maxRetries: 0,
      model: createZaiModel("glm-5.3-flash", "http://127.0.0.1:1"),
      prompt: "test",
    }),
  ).rejects.toThrow("ZAI_CODING_API_KEY is required");
});
