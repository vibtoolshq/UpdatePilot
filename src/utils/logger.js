/** @typedef {'silent' | 'error' | 'warn' | 'info' | 'debug'} LogLevel */
/** @typedef {Record<string, unknown>} LogMeta */
/** @typedef {{ write: (chunk: string) => unknown }} LogStream */

/**
 * @typedef {Object} LoggerOptions
 * @property {LogLevel} [level='info'] Minimum level to emit.
 * @property {string} [prefix='[update-pilot]'] Label included in each log line.
 * @property {boolean} [pretty=true] Use readable lines instead of JSON lines.
 * @property {LogStream} [stream=process.stdout] Output stream; default error logs use stderr.
 * @property {string[]} [redact=['token', 'password', 'authorization']] Metadata keys to mask recursively.
 */

/**
 * @typedef {Object} Logger
 * @property {(message: string, meta?: LogMeta) => void} error Write an error message.
 * @property {(message: string, meta?: LogMeta) => void} warn Write a warning.
 * @property {(message: string, meta?: LogMeta) => void} info Write an informational message.
 * @property {(message: string, meta?: LogMeta) => void} debug Write a debug message.
 * @property {(bindings?: LogMeta) => Logger} child Create a logger with bound metadata.
 */

const LEVELS = Object.freeze({
  silent: 4,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
});
const DEFAULT_REDACT = ["token", "password", "authorization"];
/** @type {{ stdout: LogStream, stderr: LogStream }} */
const runtimeProcess = /** @type {any} */ (globalThis).process;

/**
 * Recursively mask configured metadata keys.
 * @param {unknown} value Value to sanitize.
 * @param {Set<string>} keys Lowercase key names to redact.
 * @returns {unknown} Sanitized value.
 * @example
 * redact({ token: 'secret' }, new Set(['token']));
 */
function redact(value, keys) {
  if (Array.isArray(value)) return value.map((item) => redact(item, keys));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      keys.has(key.toLowerCase()) ? "***" : redact(item, keys),
    ]),
  );
}

/**
 * Create a structured logger with level filtering and recursive redaction.
 * @param {LoggerOptions} [options] Logger formatting and output options.
 * @returns {Logger} Logger methods and child factory.
 * @example
 * const logger = createLogger({ level: 'debug', pretty: false });
 * logger.info('Update checked', { version: '1.2.3' });
 */
export function createLogger(options = {}) {
  const config = {
    level: options.level ?? "info",
    prefix: options.prefix ?? "[update-pilot]",
    pretty: options.pretty ?? true,
    stream: options.stream ?? runtimeProcess.stdout,
    redact: new Set(
      (options.redact ?? DEFAULT_REDACT).map((key) => key.toLowerCase()),
    ),
  };
  if (!(config.level in LEVELS))
    throw new TypeError(`Unknown log level: ${config.level}`);

  /**
   * Build a logger that shares configuration and adds bound metadata.
   * @param {LogMeta} bindings Metadata included in each log call.
   * @returns {Logger} Configured logger.
   */
  function buildLogger(bindings) {
    /** @param {'error' | 'warn' | 'info' | 'debug'} level @param {string} message @param {LogMeta} [meta] */
    function write(level, message, meta = {}) {
      if (config.level === "silent" || LEVELS[level] > LEVELS[config.level])
        return;
      const cleanMeta = /** @type {LogMeta} */ (
        redact({ ...bindings, ...meta }, config.redact)
      );
      const time = new Date().toISOString();
      const output = config.pretty
        ? `${time} ${level.toUpperCase().padEnd(5)} ${config.prefix} ${message} ${JSON.stringify(cleanMeta)}`
        : JSON.stringify({
            time,
            level,
            prefix: config.prefix,
            message,
            ...cleanMeta,
          });
      const stream =
        level === "error" && options.stream === undefined
          ? runtimeProcess.stderr
          : config.stream;
      stream.write(`${output}\n`);
    }

    return {
      error: (message, meta) => write("error", message, meta),
      warn: (message, meta) => write("warn", message, meta),
      info: (message, meta) => write("info", message, meta),
      debug: (message, meta) => write("debug", message, meta),
      child: (childBindings = {}) =>
        buildLogger({ ...bindings, ...childBindings }),
    };
  }

  return buildLogger({});
}

const noop = () => {};
/**
 * Logger whose methods do nothing; useful for tests and disabled logging.
 * @type {Logger}
 * @example
 * const logger = silentLogger;
 * logger.info('This is intentionally ignored');
 */
export const silentLogger = Object.freeze({
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  child: () => silentLogger,
});
