// @ts-check
import { toJsonSafe } from "@solos/core";
import { Cause, Exit, Option } from "effect";

/**
 * @typedef {{ content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean }} ToolResult
 */

/**
 * @param {unknown} value
 * @returns {ToolResult}
 */
export const successResult = (value) => {
  const safe = toJsonSafe(value);
  const structured =
    typeof safe === "object" && safe !== null && !Array.isArray(safe)
      ? /** @type {Record<string, unknown>} */ (safe)
      : { value: safe };
  return {
    content: [{ type: "text", text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
};

/**
 * Domain errors travel as `{ code: _tag, ...props }`. Defects become InternalError without a stack.
 * @param {Cause.Cause<unknown>} cause
 * @returns {ToolResult}
 */
export const errorResult = (cause) => {
  const failure = Cause.failureOption(cause);
  const payload = Option.isSome(failure) ? describeFailure(failure.value) : describeDefect(cause);
  return packError(payload);
};

/**
 * Input guards run before the runtime exists, so their rejections arrive as thrown tagged
 * errors rather than failed exits. Same `{ code, ...props }` shape either way.
 * @param {unknown} error
 * @returns {ToolResult}
 */
export const thrownResult = (error) => packError(describeFailure(error));

/** @param {Record<string, unknown>} payload @returns {ToolResult} */
const packError = (payload) => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
  structuredContent: payload,
  isError: true,
});

/** @param {unknown} error */
const describeFailure = (error) => {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const { _tag, ...props } = /** @type {Record<string, unknown>} */ (error);
    const safeProps = /** @type {Record<string, unknown>} */ (toJsonSafe(props));
    return { code: String(_tag), ...safeProps };
  }
  return { code: "UnknownError", cause: String(error) };
};

/** @param {Cause.Cause<unknown>} cause */
const describeDefect = (cause) => ({
  code: "InternalError",
  cause: Cause.isInterruptedOnly(cause)
    ? "interrupted"
    : (Cause.pretty(cause).split("\n", 1)[0] ?? "defect"),
});

/**
 * @param {Exit.Exit<unknown, unknown>} exit
 * @returns {ToolResult}
 */
export const resultFromExit = (exit) =>
  Exit.isSuccess(exit) ? successResult(exit.value) : errorResult(exit.cause);
