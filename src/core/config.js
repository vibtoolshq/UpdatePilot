import { URL } from "node:url";
import { ConfigError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const ROOT_KEYS =
  "repo currentVersion currentVersionRaw github docker health rollback hooks logger".split(
    " ",
  );
const HOOK_KEYS =
  "beforeCheck afterCheck beforeDeploy afterDeploy beforeVerify afterVerify beforeRollback afterRollback onError".split(
    " ",
  );
const VERSION_PATTERN =
  /^(?:v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|[a-fA-F0-9]{7,40})$/;

const DEFAULTS = {
  github: {
    token: undefined,
    includePrerelease: false,
    cacheFile: ".update-cache.json",
    cacheTTL: 300_000,
  },
  docker: {
    tag: "latest",
    composeFile: undefined,
    containerName: ({ repo }) => repo.split("/")[1],
    socketPath: "/var/run/docker.sock",
  },
  health: {
    retries: 5,
    timeout: 5_000,
    interval: 2_000,
    expectStatus: 200,
    headers: {},
  },
  rollback: { enabled: true, keepImages: 3 },
};

function formatReceived(value) {
  if (value === undefined) return "undefined";
  if (typeof value === "function") return "[function]";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function fail(path, what, expected, received) {
  throw new ConfigError(
    `Invalid config at "${path}": ${what}. Expected ${expected}, got ${formatReceived(received)}.`,
    { context: { path, received, expected } },
  );
}

function assertObject(value, path) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    fail(path, "must be a plain object", "plain object", value);
  }
  return value;
}

function assertKnownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      fail(
        `${path}.${key}`,
        "is not a supported option",
        "a known option",
        value[key],
      );
  }
}

function assertString(value, path) {
  if (typeof value !== "string" || value.trim() === "")
    fail(path, "must be a non-empty string", "string", value);
  return value;
}

function assertBoolean(value, path) {
  if (typeof value !== "boolean")
    fail(path, "must be a boolean", "boolean", value);
  return value;
}

function assertNumberInRange(value, path, minimum, maximum, integer = false) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    const expected = `${integer ? "integer " : "number "}from ${minimum} to ${maximum}`;
    fail(
      path,
      `must be a ${integer ? "whole number" : "number"} from ${minimum} to ${maximum}`,
      expected,
      value,
    );
  }
  return value;
}

function applyDefaults(defaults, input, factoryContext = {}) {
  const keys = new Set([...Object.keys(defaults), ...Object.keys(input)]);
  return Object.fromEntries(
    [...keys].map((key) => {
      if (input[key] !== undefined) return [key, input[key]];
      const fallback = defaults[key];
      return [
        key,
        typeof fallback === "function" ? fallback(factoryContext) : fallback,
      ];
    }),
  );
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function resolveConfig(input, resolved = false) {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    if (!resolved)
      throw new ConfigError("defineConfig expects a plain object", {
        context: { path: "config", received: input, expected: "plain object" },
      });
    fail("config", "must be a plain object", "plain object", input);
  }
  assertKnownKeys(
    input,
    resolved
      ? ROOT_KEYS
      : ROOT_KEYS.filter((key) => key !== "currentVersionRaw"),
    "config",
  );

  const repo = assertString(input.repo, "repo");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
    fail("repo", "must be in 'owner/repo' format", "owner/repo format", repo);
  const rawVersion = resolved
    ? (input.currentVersionRaw ?? input.currentVersion)
    : input.currentVersion;
  const currentVersionRaw = assertString(rawVersion, "currentVersion");
  if (!VERSION_PATTERN.test(currentVersionRaw))
    fail(
      "currentVersion",
      "must be a semver string or git SHA",
      "semver string or 7-40 character git SHA",
      currentVersionRaw,
    );
  const currentVersion = currentVersionRaw.startsWith("v")
    ? currentVersionRaw.slice(1)
    : currentVersionRaw;
  if (resolved && input.currentVersion !== currentVersion)
    fail(
      "currentVersion",
      "must match currentVersionRaw",
      "the normalized currentVersionRaw value",
      input.currentVersion,
    );

  const githubInput =
    input.github === undefined ? {} : assertObject(input.github, "github");
  assertKnownKeys(
    githubInput,
    ["token", "includePrerelease", "cacheFile", "cacheTTL"],
    "github",
  );
  const github = applyDefaults(DEFAULTS.github, githubInput);
  if (
    github.token !== undefined &&
    (typeof github.token !== "string" || github.token.length < 20)
  )
    fail(
      "github.token",
      "must contain at least 20 characters",
      "string with at least 20 characters",
      github.token,
    );
  assertBoolean(github.includePrerelease, "github.includePrerelease");
  assertString(github.cacheFile, "github.cacheFile");
  assertNumberInRange(
    github.cacheTTL,
    "github.cacheTTL",
    0,
    Number.MAX_SAFE_INTEGER,
  );

  const dockerInput = assertObject(input.docker, "docker");
  assertKnownKeys(
    dockerInput,
    ["image", "tag", "composeFile", "containerName", "socketPath"],
    "docker",
  );
  const docker = applyDefaults(DEFAULTS.docker, dockerInput, { repo });
  docker.image = assertString(docker.image, "docker.image");
  docker.tag = assertString(docker.tag, "docker.tag");
  if (docker.composeFile !== undefined)
    docker.composeFile = assertString(docker.composeFile, "docker.composeFile");
  docker.containerName = assertString(
    docker.containerName,
    "docker.containerName",
  );
  docker.socketPath = assertString(docker.socketPath, "docker.socketPath");

  const healthInput = assertObject(input.health, "health");
  assertKnownKeys(
    healthInput,
    ["url", "retries", "timeout", "interval", "expectStatus", "headers"],
    "health",
  );
  const health = applyDefaults(DEFAULTS.health, healthInput);
  const headers = assertObject(health.headers, "health.headers");
  for (const [name, value] of Object.entries(headers)) {
    if (name.trim() === "")
      fail(
        "health.headers",
        "header names must be non-empty",
        "non-empty header names",
        name,
      );
    if (typeof value !== "string")
      fail(`health.headers.${name}`, "must be a string", "string", value);
  }
  health.headers = { ...headers };
  const healthUrl = assertString(health.url, "health.url");
  try {
    const parsedUrl = new URL(healthUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol))
      throw new Error("unsupported protocol");
  } catch {
    fail(
      "health.url",
      "must be a valid HTTP or HTTPS URL",
      "http or https URL",
      health.url,
    );
  }
  assertNumberInRange(health.retries, "health.retries", 1, 30, true);
  assertNumberInRange(health.timeout, "health.timeout", 100, 60_000);
  assertNumberInRange(health.interval, "health.interval", 0, 60_000, true);
  assertNumberInRange(
    health.expectStatus,
    "health.expectStatus",
    100,
    599,
    true,
  );

  const rollbackInput =
    input.rollback === undefined
      ? {}
      : assertObject(input.rollback, "rollback");
  assertKnownKeys(rollbackInput, ["enabled", "keepImages"], "rollback");
  const rollback = applyDefaults(DEFAULTS.rollback, rollbackInput);
  assertBoolean(rollback.enabled, "rollback.enabled");
  assertNumberInRange(rollback.keepImages, "rollback.keepImages", 0, 100, true);

  const hooksInput =
    input.hooks === undefined ? {} : assertObject(input.hooks, "hooks");
  assertKnownKeys(hooksInput, HOOK_KEYS, "hooks");
  const hooks = {};
  for (const key of HOOK_KEYS) {
    if (hooksInput[key] !== undefined) {
      if (typeof hooksInput[key] !== "function")
        fail(`hooks.${key}`, "must be a function", "function", hooksInput[key]);
      hooks[key] = hooksInput[key];
    }
  }

  let logger;
  const resolvedLogger =
    resolved &&
    input.logger &&
    typeof input.logger === "object" &&
    ["error", "warn", "info", "debug", "child"].every(
      (key) => typeof input.logger[key] === "function",
    );
  if (resolvedLogger) logger = input.logger;
  else {
    if (resolved)
      fail(
        "logger",
        "must be a resolved logger instance",
        "logger with error, warn, info, debug, and child methods",
        input.logger,
      );
    const loggerOptions =
      input.logger === undefined
        ? { level: "info" }
        : assertObject(input.logger, "logger");
    try {
      logger = createLogger({ level: "info", ...loggerOptions });
    } catch (error) {
      fail(
        "logger",
        `could not create logger (${error instanceof Error ? error.message : String(error)})`,
        "valid createLogger options",
        loggerOptions,
      );
    }
  }

  return deepFreeze({
    repo,
    currentVersion,
    currentVersionRaw,
    github,
    docker,
    health,
    rollback,
    hooks,
    logger,
  });
}

/** Validate config.
 * @param {Record<string, any>} userConfig Repository, Docker, and health settings.
 * @returns {Record<string, any>} Deeply frozen resolved config.
 * @example
 * defineConfig({ repo: "acme/shop", currentVersion: "1.2.3", docker: { image: "ghcr.io/acme/shop" }, health: { url: "https://shop.example.com/health" } });
 */
export function defineConfig(userConfig) {
  return resolveConfig(userConfig);
}

/** Revalidate resolved config.
 * @param {Record<string, any>} config Resolved config to check.
 * @returns {boolean} True when valid.
 * @example
 * validateConfig(defineConfig({ repo: "acme/shop", currentVersion: "1.2.3", docker: { image: "ghcr.io/acme/shop" }, health: { url: "http://localhost/health" } }));
 */
export function validateConfig(config) {
  resolveConfig(config, true);
  return true;
}
