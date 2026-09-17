// @ts-check
import { MarketAnswerSchema } from "@solos/core";
import { z } from "zod";

export const IRIS_ENDPOINT = "https://api.elfa.ai";
export const IRIS_QUESTION =
  "What changed for SOL in the last 24 hours? Include dated source links and distinguish facts from speculation.";

/** @type {[{name: "cli"; args: string[]}, {name: "mcp"; args: string[]}]} */
export const IRIS_CASES = [
  { name: /** @type {const} */ ("cli"), args: ["market", "ask", "--question", IRIS_QUESTION] },
  {
    name: /** @type {const} */ ("mcp"),
    args: [
      "mcp",
      "call",
      "solana_market_ask_iris",
      "--args",
      JSON.stringify({ question: IRIS_QUESTION }),
    ],
  },
];

/** @param {typeof IRIS_CASES[number]} spec */
export const skippedCase = (spec) => ({
  name: spec.name,
  command: `bun run solos ${spec.args.map((arg) => JSON.stringify(arg)).join(" ")}`,
  status: /** @type {const} */ ("skipped"),
  ms: 0,
});

const ErrorSchema = z.object({
  code: z.enum([
    "IrisAuthFailed",
    "IrisConfigMissing",
    "IrisHttpError",
    "IrisNetworkError",
    "IrisQuestionInvalid",
    "IrisRateLimited",
    "IrisResponseInvalid",
    "IrisTimeout",
  ]),
  status: z.number().int().optional(),
});

/** @param {string} text @returns {any} */
const jsonLine = (text) => {
  try {
    return JSON.parse(text.trim());
  } catch {
    return undefined;
  }
};

/** Only structured, allowlisted error fields escape; never stderr or upstream bodies.
 * @param {{ stdout: string; stderr: string; exitCode: number; didTimeout: boolean }} output
 */
const failure = (output) => {
  const parsed = ErrorSchema.safeParse(
    jsonLine(output.stdout)?.structuredContent ?? jsonLine(output.stderr)?.error,
  );
  if (parsed.success) return { code: parsed.data.code, httpStatus: parsed.data.status };
  return { code: output.didTimeout ? "QaProcessTimeout" : "QaInvalidOutput" };
};

/** @param {import("@solos/core").MarketAnswer} answer @param {number} started */
const isFreshAnswer = (answer, started) =>
  answer.receivedAt >= started && answer.receivedAt <= Date.now() && Boolean(answer.answer.trim());

/** @param {typeof IRIS_CASES[number]} spec @param {Record<string, string> & { ELFA_API_KEY: string }} env
 * @returns {Promise<import("./schema.js").QaCase>}
 */
export const runIrisCase = async (spec, env) => {
  const started = Date.now();
  const output = await captureSolos(spec.args, env);
  const value = jsonLine(output.stdout);
  const answer = MarketAnswerSchema.safeParse(
    spec.name === "mcp" ? value?.structuredContent : value,
  );
  const base = { ...skippedCase(spec), ms: Date.now() - started };
  if (output.exitCode !== 0 || value?.isError || !answer.success)
    return { ...base, status: "failed", ...failure(output) };
  const observed = answer.data;
  if (!isFreshAnswer(observed, started))
    return { ...base, status: "failed", code: "QaInvalidOutput" };
  return {
    ...base,
    status: "passed",
    answer: { ...observed, answer: observed.answer.replaceAll(env.ELFA_API_KEY, "[redacted]") },
  };
};

/** Child processes exercise the public CLI with a fixed env, no ambient .env files.
 * @param {string[]} args @param {Record<string, string>} env
 */
const captureSolos = async (args, env) => {
  const proc = Bun.spawn(
    [process.execPath, "--no-env-file", "run", "apps/cli/src/main.js", ...args],
    {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    proc.kill("SIGKILL");
  }, 45_000);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode, didTimeout };
  } finally {
    clearTimeout(timer);
  }
};
