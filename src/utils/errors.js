/** @typedef {{ code?: string, cause?: unknown, context?: Record<string, unknown> }} UpdatePilotErrorOptions */

/**
 * Base error for failures reported by UpdatePilot.
 * @param {string} message Human-readable failure description.
 * @param {UpdatePilotErrorOptions} [options] Error code, cause, and context.
 * @example
 * throw new UpdatePilotError('Update failed', { context: { version: '1.2.3' } });
 */
export class UpdatePilotError extends Error {
  /**
   * Create an UpdatePilot error.
   * @param {string} message Human-readable failure description.
   * @param {UpdatePilotErrorOptions} [options] Error code, cause, and context.
   * @example
   * new UpdatePilotError('Update failed', { code: 'E_CUSTOM' });
   */
  constructor(message, { code = "E_UPDATEPILOT", cause, context = {} } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "UpdatePilotError";
    this.code = code;
    this.context = context;
    const errorConstructor =
      /** @type {ErrorConstructor & { captureStackTrace?: (target: object, constructor?: Function) => void }} */ (
        Error
      );
    errorConstructor.captureStackTrace?.(this, new.target);
  }

  /**
   * Return a JSON-safe representation of this error.
   * @returns {{ name: string, code: string, message: string, context: Record<string, unknown>, stack: string | undefined }} Serialized error details.
   * @example
   * const responseBody = error.toJSON();
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Error raised for invalid configuration.
 * @param {string} message Human-readable failure description.
 * @param {UpdatePilotErrorOptions} [options] Error cause and context.
 * @example
 * throw new ConfigError('repo is required');
 */
export class ConfigError extends UpdatePilotError {
  /**
   * @param {string} message Human-readable failure description.
   * @param {UpdatePilotErrorOptions} [options] Error cause and context.
   * @example
   * new ConfigError('repo is required');
   */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? "E_CONFIG" });
    this.name = "ConfigError";
  }
}

/**
 * Error raised for GitHub API failures.
 * @param {string} message Human-readable failure description.
 * @param {UpdatePilotErrorOptions} [options] Error cause and context.
 * @example
 * throw new GitHubError('Release lookup failed');
 */
export class GitHubError extends UpdatePilotError {
  /**
   * @param {string} message Human-readable failure description.
   * @param {UpdatePilotErrorOptions} [options] Error cause and context.
   * @example
   * new GitHubError('Release lookup failed');
   */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? "E_GITHUB" });
    this.name = "GitHubError";
  }
}

/**
 * Error raised when a Docker operation fails.
 * @param {string} message Human-readable failure description.
 * @param {UpdatePilotErrorOptions} [options] Error cause and context.
 * @example
 * throw new DockerError('Image pull failed');
 */
export class DockerError extends UpdatePilotError {
  /**
   * @param {string} message Human-readable failure description.
   * @param {UpdatePilotErrorOptions} [options] Error cause and context.
   * @example
   * new DockerError('Image pull failed');
   */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? "E_DOCKER" });
    this.name = "DockerError";
  }
}

/**
 * Error raised when an application health check fails.
 * @param {string} message Human-readable failure description.
 * @param {UpdatePilotErrorOptions} [options] Error cause and context.
 * @example
 * throw new HealthCheckError('Application did not become healthy');
 */
export class HealthCheckError extends UpdatePilotError {
  /**
   * @param {string} message Human-readable failure description.
   * @param {UpdatePilotErrorOptions} [options] Error cause and context.
   * @example
   * new HealthCheckError('Application did not become healthy');
   */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? "E_HEALTH" });
    this.name = "HealthCheckError";
  }
}

/**
 * Error raised when rollback fails.
 * @param {string} message Human-readable failure description.
 * @param {UpdatePilotErrorOptions} [options] Error cause and context.
 * @example
 * throw new RollbackError('Could not restore previous image');
 */
export class RollbackError extends UpdatePilotError {
  /**
   * @param {string} message Human-readable failure description.
   * @param {UpdatePilotErrorOptions} [options] Error cause and context.
   * @example
   * new RollbackError('Could not restore previous image');
   */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? "E_ROLLBACK" });
    this.name = "RollbackError";
  }
}

/**
 * Error raised when another update is already running.
 * @param {string} message Human-readable failure description.
 * @param {UpdatePilotErrorOptions} [options] Error cause and context.
 * @example
 * throw new UpdateInProgressError('An update is already running');
 */
export class UpdateInProgressError extends UpdatePilotError {
  /**
   * @param {string} message Human-readable failure description.
   * @param {UpdatePilotErrorOptions} [options] Error cause and context.
   * @example
   * new UpdateInProgressError('An update is already running');
   */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? "E_BUSY" });
    this.name = "UpdateInProgressError";
  }
}

/**
 * Error raised when the GitHub API rate limit is reached.
 * @param {string} message Human-readable failure description.
 * @param {UpdatePilotErrorOptions} [options] Error cause and context.
 * @example
 * throw new RateLimitError('GitHub rate limit reached');
 */
export class RateLimitError extends UpdatePilotError {
  /**
   * @param {string} message Human-readable failure description.
   * @param {UpdatePilotErrorOptions} [options] Error cause and context.
   * @example
   * new RateLimitError('GitHub rate limit reached');
   */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? "E_RATE_LIMIT" });
    this.name = "RateLimitError";
  }
}

/**
 * Check whether a value is an UpdatePilot error.
 * @param {unknown} err Value to check.
 * @returns {err is UpdatePilotError} True for UpdatePilotError instances and subclasses.
 * @example
 * if (isUpdatePilotError(error)) console.error(error.code);
 */
export function isUpdatePilotError(err) {
  return err instanceof UpdatePilotError;
}
