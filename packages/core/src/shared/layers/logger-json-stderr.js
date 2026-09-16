// @ts-check
import { Layer, LogLevel, Logger } from "effect";

/** @type {Record<string, LogLevel.LogLevel>} */
const LEVELS = {
  debug: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warning,
  error: LogLevel.Error,
};

/** @param {string | undefined} level */
export const parseLogLevel = (level) => LEVELS[(level ?? "info").toLowerCase()] ?? LogLevel.Info;

/**
 * Structured JSON logs on stderr. stdout stays clean for stdio JSON-RPC.
 * @param {string | undefined} level
 */
export const LoggerJsonStderr = (level) =>
  Layer.mergeAll(
    Logger.replace(Logger.defaultLogger, Logger.jsonLogger.pipe(Logger.withConsoleError)),
    Logger.minimumLogLevel(parseLogLevel(level)),
  );
