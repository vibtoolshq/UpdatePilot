import assert from "node:assert/strict";
import { test } from "node:test";
import { defineConfig, validateConfig } from "../src/core/config.js";
import { ConfigError } from "../src/utils/errors.js";

function minimalConfig(overrides = {}) {
  const config = {
    repo: "org/app",
    currentVersion: "1.2.3",
    docker: { image: "ghcr.io/org/app" },
    health: { url: "http://localhost:3000/health" },
    ...overrides,
  };
  config.docker = overrides.docker ?? { image: "ghcr.io/org/app" };
  config.health = overrides.health ?? { url: "http://localhost:3000/health" };
  return config;
}

function expectConfigError(value, path) {
  assert.throws(
    () => defineConfig(value),
    (error) => {
      assert.ok(error instanceof ConfigError);
      if (path) assert.equal(error.context.path, path);
      assert.match(error.message, /Expected .+, got .+\./);
      return true;
    },
  );
}

test("minimal valid config resolves all defaults", () => {
  const config = defineConfig(minimalConfig());

  assert.equal(config.currentVersion, "1.2.3");
  assert.equal(config.currentVersionRaw, "1.2.3");
  assert.equal(config.github.token, undefined);
  assert.equal(config.github.includePrerelease, false);
  assert.equal(config.github.cacheFile, ".update-cache.json");
  assert.equal(config.github.cacheTTL, 300_000);
  assert.equal(config.docker.tag, "latest");
  assert.equal(config.docker.containerName, "app");
  assert.equal(config.docker.socketPath, "/var/run/docker.sock");
  assert.equal(config.health.retries, 5);
  assert.equal(config.health.timeout, 5_000);
  assert.equal(config.health.interval, 2_000);
  assert.equal(config.health.expectStatus, 200);
  assert.equal(config.rollback.enabled, true);
  assert.equal(config.rollback.keepImages, 3);
  assert.equal(config.logger.info instanceof Function, true);
});

test("full config overrides defaults and preserves only defined hooks", () => {
  const beforeDeploy = () => {};
  const config = defineConfig(
    minimalConfig({
      github: {
        token: "x".repeat(20),
        includePrerelease: true,
        cacheFile: "/tmp/releases.json",
        cacheTTL: 12_000,
      },
      docker: {
        image: "ghcr.io/org/app",
        tag: "1.2.3",
        composeFile: "compose.yml",
        containerName: "shop",
        socketPath: "/tmp/docker.sock",
      },
      health: {
        url: "https://example.test/health",
        retries: 8,
        timeout: 10_000,
        interval: 250,
        expectStatus: 204,
      },
      rollback: { enabled: false, keepImages: 7 },
      hooks: { beforeDeploy },
      logger: { level: "debug", pretty: false },
    }),
  );

  assert.equal(config.github.token.length, 20);
  assert.equal(config.github.includePrerelease, true);
  assert.equal(config.github.cacheFile, "/tmp/releases.json");
  assert.equal(config.github.cacheTTL, 12_000);
  assert.equal(config.docker.tag, "1.2.3");
  assert.equal(config.docker.composeFile, "compose.yml");
  assert.equal(config.docker.containerName, "shop");
  assert.equal(config.docker.socketPath, "/tmp/docker.sock");
  assert.equal(config.health.retries, 8);
  assert.equal(config.health.timeout, 10_000);
  assert.equal(config.health.interval, 250);
  assert.equal(config.health.expectStatus, 204);
  assert.equal(config.rollback.enabled, false);
  assert.equal(config.rollback.keepImages, 7);
  assert.deepEqual(Object.keys(config.hooks), ["beforeDeploy"]);
  assert.equal(config.hooks.beforeDeploy, beforeDeploy);
  assert.equal(typeof config.logger.debug, "function");
});

test("rejects non-plain top-level values", () => {
  for (const value of [null, undefined, "config", []]) {
    assert.throws(
      () => defineConfig(/** @type {any} */ (value)),
      (error) => error instanceof ConfigError,
    );
  }
});

test("rejects invalid repository formats with the repo path", () => {
  for (const repo of ["owner", "", "bad/name/extra", "owner/name?", "/name"]) {
    expectConfigError(minimalConfig({ repo }), "repo");
  }
});

test("rejects invalid versions", () => {
  for (const currentVersion of ["1.2", "", "random text"]) {
    expectConfigError(minimalConfig({ currentVersion }), "currentVersion");
  }
});

test("requires a Docker image", () => {
  expectConfigError(minimalConfig({ docker: {} }), "docker.image");
});

test("requires an HTTP or HTTPS health URL", () => {
  for (const url of [
    "not a url",
    "ftp://example.com/health",
    "file:///health",
  ]) {
    expectConfigError(minimalConfig({ health: { url } }), "health.url");
  }
});

test("supports and freezes copied health headers", () => {
  const headers = { authorization: "Bearer token", "x-empty": "" };
  const config = defineConfig(
    minimalConfig({
      health: { url: "http://localhost/health", headers },
    }),
  );

  assert.deepEqual(config.health.headers, headers);
  assert.notEqual(config.health.headers, headers);
  assert.equal(Object.isFrozen(config.health.headers), true);
  assert.equal(Object.isFrozen(headers), false);
});

test("health interval is an integer from zero through 60000 milliseconds", () => {
  for (const interval of [-1, 60_001, 1.5])
    expectConfigError(
      minimalConfig({ health: { url: "http://localhost/health", interval } }),
      "health.interval",
    );

  assert.equal(
    defineConfig(
      minimalConfig({
        health: { url: "http://localhost/health", interval: 60_000 },
      }),
    ).health.interval,
    60_000,
  );
});

test("requires health retries to be an integer from 1 through 30", () => {
  for (const retries of [0, 31, 1.5]) {
    expectConfigError(
      minimalConfig({ health: { url: "http://localhost/health", retries } }),
      "health.retries",
    );
  }
});

test("requires hooks to be functions", () => {
  expectConfigError(
    minimalConfig({ hooks: { beforeDeploy: "not a function" } }),
    "hooks.beforeDeploy",
  );
});

test("normalizes a leading v while preserving the original version", () => {
  const config = defineConfig(minimalConfig({ currentVersion: "v1.2.3" }));
  assert.equal(config.currentVersion, "1.2.3");
  assert.equal(config.currentVersionRaw, "v1.2.3");
});

test("accepts git SHA versions and derives a Docker name from the repository", () => {
  const config = defineConfig(
    minimalConfig({ currentVersion: "0123456789abcdef01234567" }),
  );
  assert.equal(config.currentVersion, "0123456789abcdef01234567");
  assert.equal(config.docker.containerName, "app");
});

test("deeply freezes the resolved config but does not freeze hook functions", () => {
  const hook = () => {};
  const config = defineConfig(minimalConfig({ hooks: { beforeDeploy: hook } }));
  assert.throws(() => {
    config.docker.image = "changed";
  }, TypeError);
  assert.throws(() => {
    config.github.cacheTTL = 0;
  }, TypeError);
  assert.throws(() => {
    config.hooks.afterDeploy = hook;
  }, TypeError);
  assert.equal(Object.isFrozen(hook), false);
});

test("validateConfig accepts a resolved config and rejects invalid input", () => {
  assert.equal(validateConfig(defineConfig(minimalConfig())), true);
  assert.throws(
    () => validateConfig({ repo: "bad" }),
    (error) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.context.path, "repo");
      return true;
    },
  );
});
