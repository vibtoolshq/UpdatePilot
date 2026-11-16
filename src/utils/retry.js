import { isUpdatePilotError } from "./errors.js";

/**
 * @typedef {Object} RetryOptions
 * @property {number} [retries=3] Total number of attempts, including the first.
 * @property {number} [baseDelay=300] Initial retry delay in milliseconds.
 * @property {number} [maxDelay=10000] Maximum delay in milliseconds.
 * @property {number} [factor=2] Exponential delay multiplier.
 * @property {boolean} [jitter=true] Apply random plus-or-minus 20 percent jitter.
 * @property {(err: unknown, attempt: number, delayMs: number) => void} [onRetry] Called before each retry; attempt is the upcoming attempt number.
 * @property {(err: unknown, attempt: number) => boolean} [shouldRetry] Decide whether a failed attempt should be retried.
 * @property {AbortSignal} [signal] Abort pending attempts or waits.
 */

/**
 * Wait for a duration, optionally rejecting when an AbortSignal fires.
 * @param {number} ms Duration in milliseconds.
 * @param {AbortSignal} [signal] Optional cancellation signal.
 * @returns {Promise<void>} Resolves after the duration.
 * @example
 * await sleep(100, signal);
 */
export function sleep(ms, signal) {
  if (!Number.isFinite(ms) || ms < 0)
    throw new RangeError("ms must be a non-negative finite number");
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new Error("The operation was aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

/**
 * Retry an asynchronous operation with exponential backoff and jitter.
 * @template T
 * @param {() => T | Promise<T>} fn Operation to invoke.
 * @param {RetryOptions} [options] Retry count, timing, and cancellation settings.
 * @returns {Promise<T>} The first successful operation result.
 * @example
 * const result = await retry(() => fetchRelease(), { retries: 4 });
 */
export async function retry(fn, options = {}) {
  const {
    retries = 3,
    baseDelay = 300,
    maxDelay = 10_000,
    factor = 2,
    jitter = true,
    onRetry,
    shouldRetry = (err) =>
      !(
        isUpdatePilotError(err) &&
        ["E_CONFIG", "E_RATE_LIMIT"].includes(err.code)
      ),
    signal,
  } = options;
  if (!Number.isInteger(retries) || retries < 1)
    throw new RangeError("retries must be a positive integer");
  if (
    ![baseDelay, maxDelay].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  ) {
    throw new RangeError(
      "baseDelay and maxDelay must be non-negative finite numbers",
    );
  }
  if (!Number.isFinite(factor) || factor <= 0)
    throw new RangeError("factor must be a positive finite number");

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    signal?.throwIfAborted();
    try {
      const result = await fn();
      signal?.throwIfAborted();
      return result;
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      if (attempt === retries || !shouldRetry(error, attempt)) throw error;
      const nextAttempt = attempt + 1;
      const base = Math.min(maxDelay, baseDelay * factor ** (nextAttempt - 2));
      const delayMs = Math.min(
        maxDelay,
        jitter ? base * (0.8 + Math.random() * 0.4) : base,
      );
      onRetry?.(error, nextAttempt, delayMs);
      await sleep(delayMs, signal);
    }
  }
  throw new Error("Retry loop exited unexpectedly");
}
