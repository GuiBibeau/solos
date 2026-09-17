// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveBotName } from "../lib/github/bot-name.js";
import { rebaseApi } from "../lib/github/rebase-api.js";
import { rebasePullRequest } from "../lib/github/rebase-pull-request.js";

export default defineTool({
  description:
    "Rebase an open factory PR onto main with GitHub's expected-head guard. Only this session's PR or a trusted maintainer is authorized. Records one attempt per head/main pair; conflicts stop for a human. A successful result must be followed by clean verification, independent review and fresh PR Evidence. Never merges a PR.",
  inputSchema: z.object({
    pullNumber: z.number().int().positive().describe("Existing factory PR number"),
    expectedHead: z
      .string()
      .regex(/^[a-f\d]{40}$/u)
      .describe("PR head SHA observed at dispatch"),
    expectedBase: z
      .string()
      .regex(/^[a-f\d]{40}$/u)
      .describe("Main SHA observed at dispatch"),
  }),
  async execute(input, ctx) {
    return rebasePullRequest(input, {
      api: rebaseApi(),
      botName: await resolveBotName(),
      auth: ctx.session.auth.current,
    });
  },
});
