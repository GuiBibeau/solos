// @ts-check
/**
 * Run-wide eval configuration. The judge model scores `t.judge.*` assertions only; it never
 * changes the agent under test. Run the cheap loop with `bun run eval --tag fast`.
 */
import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  judge: { model: process.env.FACTORY_MODEL_JUDGE ?? "deepseek/deepseek-v4.1-flash" },
});
