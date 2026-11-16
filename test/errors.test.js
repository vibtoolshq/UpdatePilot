import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConfigError,
  DockerError,
  GitHubError,
  HealthCheckError,
  isUpdatePilotError,
  RateLimitError,
  RollbackError,
  UpdateInProgressError,
  UpdatePilotError,
} from "../src/utils/errors.js";

test("base error stores name, code, context, and native cause", () => {
  const cause = new Error("root cause");
  const error = new UpdatePilotError("update failed", {
    cause,
    context: { version: "1.2.3" },
  });

  assert.equal(error.name, "UpdatePilotError");
  assert.equal(error.code, "E_UPDATEPILOT");
  assert.deepEqual(error.context, { version: "1.2.3" });
  assert.equal(error.cause, cause);
  assert.match(error.stack, /UpdatePilotError: update failed/);
});

test("subclasses use their default codes and names", () => {
  /** @type {Array<[typeof ConfigError, string]>} */
  const cases = [
    [ConfigError, "E_CONFIG"],
    [GitHubError, "E_GITHUB"],
    [DockerError, "E_DOCKER"],
    [HealthCheckError, "E_HEALTH"],
    [RollbackError, "E_ROLLBACK"],
    [UpdateInProgressError, "E_BUSY"],
    [RateLimitError, "E_RATE_LIMIT"],
  ];

  for (const [ErrorType, code] of cases) {
    const error = new ErrorType("failure");
    assert.equal(error.code, code);
    assert.equal(error.name, ErrorType.name);
  }
});

test("toJSON returns the documented fields", () => {
  const error = new ConfigError("invalid repo", { context: { field: "repo" } });

  assert.deepEqual(error.toJSON(), {
    name: "ConfigError",
    code: "E_CONFIG",
    message: "invalid repo",
    context: { field: "repo" },
    stack: error.stack,
  });
});

test("isUpdatePilotError recognizes subclasses but not plain errors", () => {
  assert.equal(isUpdatePilotError(new RateLimitError("limited")), true);
  assert.equal(isUpdatePilotError(new Error("plain")), false);
});
