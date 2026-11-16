/**
 * UpdatePilot — One-click safe self-hosted update engine for Node.js apps.
 * @module update-pilot
 * @example
 * import { UpdatePilot, defineConfig } from "update-pilot";
 * const engine = new UpdatePilot(defineConfig({ ... }));
 * const result = await engine.runUpdate();
 */
export { DockerAdapter } from "./adapters/docker.js";
export { GitHubAdapter } from "./adapters/github.js";
export { HealthAdapter } from "./adapters/health.js";
export { defineConfig, validateConfig } from "./core/config.js";
export { UpdatePilot } from "./core/engine.js";
export { HookBus, HOOKS } from "./core/events.js";
export {
  ConfigError,
  DockerError,
  GitHubError,
  HealthCheckError,
  isUpdatePilotError,
  RateLimitError,
  RollbackError,
  UpdateInProgressError,
  UpdatePilotError,
} from "./utils/errors.js";
export { createLogger, silentLogger } from "./utils/logger.js";

/** Public package version. */
export const VERSION = "0.0.1";
