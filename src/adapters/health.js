import { HealthCheckError } from "../utils/errors.js";
import { silentLogger } from "../utils/logger.js";
import { sleep } from "../utils/retry.js";

/** @typedef {{ healthy: true, url: string, status: number, attempts: number, latencyMs: number, checkedAt: string }} HealthCheckResult */
/** @typedef {{ url?: string, retries?: number, timeout?: number, interval?: number, expectStatus?: number, headers?: Record<string, string>, logger?: Object, fetchImpl?: typeof fetch, sleepImpl?: typeof sleep }} HealthAdapterOptions */

/**
 * Check whether an HTTP health endpoint is ready to serve requests.
 * @example
 * const health = new HealthAdapter({ url: "http://localhost:3000/health" });
 * await health.waitUntilHealthy();
 */
export class HealthAdapter {
  /**
   * Configure an HTTP(S) health check.
   * @param {HealthAdapterOptions} options Endpoint, retry policy, and injectable I/O functions.
   * @example
   * new HealthAdapter({ url: "https://app.example.com/health", retries: 5, timeout: 5000 });
   */
  constructor({
    url,
    retries = 5,
    timeout = 5_000,
    interval = 2_000,
    expectStatus = 200,
    headers = {},
    logger = silentLogger,
    fetchImpl = globalThis.fetch,
    sleepImpl = sleep,
  } = {}) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      // Invalid URLs are reported through the constructor validation below.
    }
    if (!parsed || !["http:", "https:"].includes(parsed.protocol))
      this._configError(
        "url",
        "HealthAdapter: url must be a valid http(s) URL",
        url,
        "HTTP(S) URL",
      );
    this._assertInteger("retries", retries, 1, 30);
    this._assertInteger("timeout", timeout, 100, 60_000);
    this._assertInteger("interval", interval, 0, 60_000);
    this._assertInteger("expectStatus", expectStatus, 100, 599);
    if (
      headers === null ||
      typeof headers !== "object" ||
      Array.isArray(headers)
    )
      this._configError(
        "headers",
        "HealthAdapter: headers must be an object",
        headers,
        "header object",
      );
    if (typeof fetchImpl !== "function" || typeof sleepImpl !== "function")
      this._configError(
        "fetchImpl/sleepImpl",
        "HealthAdapter: injected implementations must be functions",
        undefined,
        "functions",
      );
    this.url = parsed.href;
    this.retries = retries;
    this.timeout = timeout;
    this.interval = interval;
    this.expectStatus = expectStatus;
    this.headers = { ...headers };
    this.logger = logger;
    this.fetchImpl = fetchImpl;
    this.sleepImpl = sleepImpl;
  }

  /**
   * Check the endpoint until it succeeds or all attempts fail.
   * @param {{ signal?: AbortSignal, url?: string }} [options] Optional candidate endpoint and cancellation signal.
   * @returns {Promise<HealthCheckResult>} Successful health result and attempt metadata.
   * @example
   * const result = await adapter.check({ signal: AbortSignal.timeout(10000) });
   */
  async check({ signal, url = this.url } = {}) {
    const targetUrl = this._resolveUrl(url);
    let lastAttempt;
    for (let attempt = 1; attempt <= this.retries; attempt += 1) {
      if (signal?.aborted) throw this._abortedError(signal.reason, targetUrl);
      lastAttempt = await this._attempt(
        this._combineSignals(this.timeout, signal),
        targetUrl,
      );
      if (signal?.aborted) throw this._abortedError(signal.reason, targetUrl);
      if (lastAttempt.ok) return this._result(lastAttempt, attempt, targetUrl);
      this._logFailure(lastAttempt, attempt, targetUrl);
      if (attempt < this.retries) {
        try {
          await this.sleepImpl(this.interval, signal);
        } catch (error) {
          if (signal?.aborted || error?.name === "AbortError")
            throw this._abortedError(signal?.reason ?? error, targetUrl);
          throw new HealthCheckError("Health check retry delay failed", {
            cause: error,
            context: { url: targetUrl, operation: "sleep" },
          });
        }
        if (signal?.aborted) throw this._abortedError(signal.reason, targetUrl);
      }
    }
    throw this._failure(lastAttempt, this.retries, targetUrl);
  }

  /**
   * Perform one health request without retrying.
   * @param {{ signal?: AbortSignal, url?: string }} [options] Optional candidate endpoint and cancellation signal.
   * @returns {Promise<HealthCheckResult>} Successful health result for the single attempt.
   * @example
   * const probe = await adapter.checkOnce();
   */
  async checkOnce({ signal, url = this.url } = {}) {
    const targetUrl = this._resolveUrl(url);
    if (signal?.aborted) throw this._abortedError(signal.reason, targetUrl);
    const attempt = await this._attempt(
      this._combineSignals(this.timeout, signal),
      targetUrl,
    );
    if (signal?.aborted) throw this._abortedError(signal.reason, targetUrl);
    if (!attempt.ok) {
      this._logFailure(attempt, 1, targetUrl);
      throw this._failure(attempt, 1, targetUrl);
    }
    return this._result(attempt, 1, targetUrl);
  }

  /**
   * Alias for check(), named for deployment lifecycle readability.
   * @param {{ signal?: AbortSignal, url?: string }} [options] Optional candidate endpoint and cancellation signal.
   * @returns {Promise<HealthCheckResult>} Successful health result.
   * @example
   * await adapter.waitUntilHealthy();
   */
  async waitUntilHealthy({ signal, url } = {}) {
    return this.check({ signal, url });
  }

  _resolveUrl(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      // Invalid URLs are reported through the validation below.
    }
    if (!parsed || !["http:", "https:"].includes(parsed.protocol))
      this._configError(
        "url",
        "HealthAdapter: url must be a valid http(s) URL",
        url,
        "HTTP(S) URL",
      );
    return parsed.href;
  }

  _assertInteger(field, value, minimum, maximum) {
    if (!Number.isInteger(value) || value < minimum || value > maximum)
      this._configError(
        field,
        `HealthAdapter: ${field} must be an integer from ${minimum} to ${maximum}`,
        value,
        `integer ${minimum}..${maximum}`,
      );
  }

  _configError(field, message, received, expected) {
    throw new HealthCheckError(message, {
      context: { field, received, expected },
    });
  }

  _combineSignals(timeoutMs, externalSignal) {
    if (!externalSignal && typeof AbortSignal.timeout === "function")
      return AbortSignal.timeout(timeoutMs);
    const timeoutController = new AbortController();
    const timer = setTimeout(
      () =>
        timeoutController.abort(
          new DOMException("Health check timed out", "TimeoutError"),
        ),
      timeoutMs,
    );
    if (!externalSignal) {
      timeoutController.signal.addEventListener(
        "abort",
        () => clearTimeout(timer),
        { once: true },
      );
      return timeoutController.signal;
    }
    const cleanup = () => {
      clearTimeout(timer);
      externalSignal.removeEventListener("abort", abortFromExternal);
      timeoutController.signal.removeEventListener("abort", cleanup);
    };
    const abortFromExternal = () =>
      timeoutController.abort(externalSignal.reason);
    externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    timeoutController.signal.addEventListener("abort", cleanup, { once: true });
    if (externalSignal.aborted) abortFromExternal();
    return typeof AbortSignal.any === "function"
      ? AbortSignal.any([timeoutController.signal, externalSignal])
      : this._manualCombinedSignal(
          timeoutController.signal,
          externalSignal,
          cleanup,
        );
  }

  _manualCombinedSignal(timeoutSignal, externalSignal, cleanup) {
    const controller = new AbortController();
    const abort = (source) => {
      if (!controller.signal.aborted) controller.abort(source.reason);
      cleanup();
    };
    timeoutSignal.addEventListener("abort", () => abort(timeoutSignal), {
      once: true,
    });
    externalSignal.addEventListener("abort", () => abort(externalSignal), {
      once: true,
    });
    if (timeoutSignal.aborted) abort(timeoutSignal);
    else if (externalSignal.aborted) abort(externalSignal);
    return controller.signal;
  }

  async _attempt(signal, url = this.url) {
    const started = performance.now();
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: this.headers,
        signal,
        redirect: "manual",
      });
      const latencyMs = performance.now() - started;
      return response.status === this.expectStatus
        ? { ok: true, status: response.status, latencyMs }
        : { ok: false, status: response.status, latencyMs, reason: "status" };
    } catch (error) {
      const latencyMs = performance.now() - started;
      return {
        ok: false,
        status: null,
        latencyMs,
        reason:
          signal.aborted || ["AbortError", "TimeoutError"].includes(error?.name)
            ? "timeout"
            : "network",
        error,
      };
    }
  }

  _result(attempt, attempts, url = this.url) {
    return {
      healthy: /** @type {true} */ (true),
      url,
      status: attempt.status,
      attempts,
      latencyMs: attempt.latencyMs,
      checkedAt: new Date().toISOString(),
    };
  }

  _logFailure(attempt, number, url = this.url) {
    try {
      this.logger.debug("Health check attempt failed", {
        url,
        attempt: number,
        status: attempt.status,
        reason: attempt.reason,
      });
    } catch {
      // Logging failures must not alter health-check results.
    }
  }

  _failure(attempt, attempts, url = this.url) {
    const reason = attempt?.reason ?? "network";
    return new HealthCheckError(
      `Health check failed after ${attempts} attempts: ${reason}`,
      {
        cause: attempt?.error,
        context: {
          url,
          attempts,
          lastStatus: attempt?.status ?? null,
          lastReason: reason,
          lastError: attempt?.error,
        },
      },
    );
  }

  _abortedError(cause, url = this.url) {
    return new HealthCheckError("Health check aborted by caller", {
      cause,
      context: { url, reason: "aborted" },
    });
  }
}
