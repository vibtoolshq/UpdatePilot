import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as esm from "update-pilot";

const require = createRequire(import.meta.url);

test("package root exposes the same public API through ESM and require", () => {
  const commonjs = require("update-pilot");
  const names = [
    "UpdatePilot",
    "HookBus",
    "HOOKS",
    "GitHubAdapter",
    "DockerAdapter",
    "HealthAdapter",
    "defineConfig",
  ];

  for (const name of names) {
    assert.ok(name in esm);
    assert.ok(name in commonjs);
    assert.equal(typeof commonjs[name], typeof esm[name]);
  }
  assert.equal("default" in esm, false);
  assert.equal("default" in commonjs, false);
  assert.ok(new commonjs.HookBus() instanceof commonjs.HookBus);
});

test("adapter subpaths are available through ESM and require", async () => {
  const adapterPath = ["update-pilot", "adapters", "health"].join("/");
  const esmHealth = await import(adapterPath);
  const commonjsHealth = require(adapterPath);

  assert.equal(typeof esmHealth.HealthAdapter, "function");
  assert.equal(typeof commonjsHealth.HealthAdapter, "function");
});

test("TrafficRouter conformance helper is available through ESM and require", async () => {
  const helperPath = "update-pilot/testing/traffic-router-contract";
  const esmHelper = await import(helperPath);
  const commonjsHelper = require(helperPath);

  assert.equal(typeof esmHelper.defineTrafficRouterContractTests, "function");
  assert.equal(
    typeof commonjsHelper.defineTrafficRouterContractTests,
    "function",
  );
});
